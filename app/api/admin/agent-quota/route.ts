import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { getServiceClient } from "@/lib/supabase-service";
import { getBillingWindow, getUserUsage } from "@/lib/server/usage";
import type { AdminQuotaResetsResponse } from "@/lib/types";

/**
 * Administration du BUDGET D'USAGE d'un compte (`/admin` → fiche d'un compte).
 * Gate identique aux autres endpoints admin : JWT via getClaims + isAdminUser.
 *
 * Depuis MIN-72 il n'y a PLUS de plafond global : la limite de chaque
 * utilisateur est le budget mensuel de SON plan (lib/billing-plans.ts), toutes
 * features confondues.
 *
 *  GET    ?userId=<uuid>  → les remises à zéro de SA période de facturation en
 *                           cours, de la plus récente à la plus ancienne.
 *  POST   { userId }      → en pose une de plus : le décompte repart de
 *                           maintenant.
 *  DELETE ?id=<uuid>      → en retire une ; la précédente reprend la main.
 *
 * Elles s'EMPILENT : la table est un registre (une ligne par geste), et c'est la
 * plus récente qui fixe le début de la fenêtre comptée. Offrir une deuxième
 * rallonge dans le mois ne fait donc plus disparaître la trace de la première —
 * et le compte de la période dit ce qu'on a déjà donné.
 *
 * Une remise à zéro NE SUPPRIME AUCUNE donnée de coût : `ai_usage` est un ledger
 * append-only, source des analyses. On déplace seulement le début de la fenêtre
 * comptée (cf. migrations 20260811090000 et 20261105090000).
 */

async function requireAdmin(
  request: NextRequest,
): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return { ok: false, response: auth.response };
  if (!(await isAdminUser(auth.user))) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, userId: auth.user.id };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * L'état complet du budget d'un compte APRÈS écriture, recalculé côté serveur.
 *
 * Les trois verbes le renvoient, et c'est volontaire : retirer une remise à zéro
 * ROUVRE la fenêtre sur des dépenses qui n'étaient plus comptées — le client n'a
 * aucun moyen de deviner le nouveau montant, et le supposer ferait clignoter un
 * chiffre faux jusqu'au prochain chargement.
 */
async function quotaStateOf(userId: string): Promise<AdminQuotaResetsResponse> {
  const usage = await getUserUsage(userId);
  const periodStart = getBillingWindow(usage.billing).start;

  const service = getServiceClient();
  const { data, error } = await service
    .from("agent_quota_resets")
    .select("id, reset_at")
    .eq("user_id", userId)
    .gte("reset_at", periodStart)
    .order("reset_at", { ascending: false });
  if (error) throw new Error(error.message);

  const budgetUsd = usage.billing.plan.includedUsageUsd;
  return {
    periodStart,
    resets: ((data ?? []) as Array<{ id: string; reset_at: string }>).map((row) => ({
      id: row.id,
      at: row.reset_at,
    })),
    usage: {
      spentUsd: usage.usedUsd,
      blocked: usage.usedUsd >= budgetUsd,
    },
  };
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const userId = request.nextUrl.searchParams.get("userId") ?? "";
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  try {
    return NextResponse.json(await quotaStateOf(userId));
  } catch (err) {
    console.error("[admin/agent-quota] read failed:", (err as Error).message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}

/** POST { userId } — une remise à zéro de plus : le quota repart de maintenant. */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  let body: { userId?: unknown };
  try {
    const parsed: unknown = await request.json();
    // Corps non-objet (null, chaîne…) : refusé ici plutôt que de crasher plus bas.
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as { userId?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  const service = getServiceClient();
  const resetAt = new Date().toISOString();
  // INSERT, plus upsert : chaque geste laisse sa propre ligne. L'ancien
  // `onConflict: user_id` écrasait la précédente — c'est exactement ce qui
  // empêchait d'en poser plusieurs.
  const { error } = await service.from("agent_quota_resets").insert({
    user_id: userId,
    reset_at: resetAt,
    reset_by: admin.userId,
    updated_at: resetAt,
  });
  if (error) {
    console.error("[admin/agent-quota] reset failed:", error.message);
    return NextResponse.json({ error: "Reset failed" }, { status: 500 });
  }

  try {
    return NextResponse.json(await quotaStateOf(userId));
  } catch (err) {
    console.error("[admin/agent-quota] read after reset failed:", (err as Error).message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}

/** DELETE ?id= — retire UNE remise à zéro ; la précédente reprend la main. */
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const service = getServiceClient();
  // `select` au retour : c'est la seule façon de savoir de QUEL compte était ce
  // geste, donc quel état recalculer.
  const { data, error } = await service
    .from("agent_quota_resets")
    .delete()
    .eq("id", id)
    .select("user_id")
    .maybeSingle();
  if (error) {
    console.error("[admin/agent-quota] undo reset failed:", error.message);
    return NextResponse.json({ error: "Undo failed" }, { status: 500 });
  }
  const userId = (data as { user_id?: string } | null)?.user_id;
  if (!userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    return NextResponse.json(await quotaStateOf(userId));
  } catch (err) {
    console.error("[admin/agent-quota] read after undo failed:", (err as Error).message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}
