import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { getServiceClient } from "@/lib/supabase-service";
import { getUserUsage } from "@/lib/server/usage";
import { displayName } from "@/lib/display-name";

/**
 * Administration des LIMITES d'usage (`/admin` → onglet « Quotas »).
 * Gate identique aux autres endpoints admin : JWT via getClaims + isAdminUser.
 *
 * Depuis MIN-72 il n'y a PLUS de plafond global : la limite de chaque
 * utilisateur est le budget mensuel de SON plan (lib/billing-plans.ts), toutes
 * features confondues — l'écran l'affiche par ligne, avec le plan résolu.
 *
 *  GET    → une ligne par utilisateur ayant consommé de l'IA ce mois-ci :
 *           dépense réelle du mois (analyses) vs dépense comptée sur SA vraie
 *           fenêtre (période Stripe ou mois, bornée par le filigrane) + budget.
 *  POST   { userId }        → remet son budget à zéro (pose le filigrane).
 *  DELETE ?userId=<uuid>    → annule la remise à zéro (le mois entier recompte).
 *
 * La remise à zéro NE SUPPRIME AUCUNE donnée de coût : `ai_usage` est un ledger
 * append-only, source des analyses. On déplace seulement le début de la fenêtre
 * comptée (cf. migration 20260811090000_agent_quota_resets.sql).
 */

async function requireAdmin(
  request: NextRequest,
): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return { ok: false, response: auth.response };
  if (!isAdminUser(auth.user)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, userId: auth.user.id };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface QuotaUsageRow {
  user_id: string;
  spent_month: number;
  spent_counted: number;
  calls: number;
  last_used_at: string;
  reset_at: string | null;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const service = getServiceClient();
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();

  const { data, error } = await service.rpc("get_agent_quota_usage", {
    p_month_start: monthStart,
  });
  if (error) {
    console.error("[admin/agent-quota] get_agent_quota_usage failed:", error.message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const rows = (data ?? []) as QuotaUsageRow[];
  // Nom lisible par utilisateur (jamais l'email brut côté UI, cf. lib/display-name).
  // Une poignée d'utilisateurs par mois → résolution unitaire, pas de listUsers.
  // `getUserUsage` donne la dépense comptée sur la VRAIE fenêtre de l'utilisateur
  // (période Stripe ou mois calendaire, bornée par le filigrane) + son plan.
  const users = await Promise.all(
    rows.map(async (r) => {
      const [{ data: u }, usage] = await Promise.all([
        service.auth.admin.getUserById(r.user_id),
        getUserUsage(r.user_id),
      ]);
      const meta = u?.user?.user_metadata as { full_name?: string } | undefined;
      const capUsd = usage.billing.plan.includedUsageUsd;
      return {
        userId: r.user_id,
        name: displayName({ full_name: meta?.full_name, email: u?.user?.email }, "—"),
        planId: usage.billing.planId,
        /** Budget mensuel du plan de CET utilisateur (USD, coût brut). */
        capUsd,
        /** Dépense RÉELLE du mois — analyses, jamais altérée par une remise à zéro. */
        spentMonth: Number(r.spent_month) || 0,
        /** Ce que le budget compte vraiment (vraie fenêtre + filigrane). */
        spentCounted: usage.usedUsd,
        calls: Number(r.calls) || 0,
        lastUsedAt: r.last_used_at,
        resetAt: r.reset_at,
        blocked: usage.usedUsd >= capUsd,
      };
    }),
  );

  return NextResponse.json({ monthStart, users });
}

/** POST { userId } — pose le filigrane : le quota repart de maintenant. */
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
  const { error } = await service
    .from("agent_quota_resets")
    .upsert(
      { user_id: userId, reset_at: resetAt, reset_by: admin.userId, updated_at: resetAt },
      { onConflict: "user_id" },
    );
  if (error) {
    console.error("[admin/agent-quota] reset failed:", error.message);
    return NextResponse.json({ error: "Reset failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, userId, resetAt });
}

/** DELETE ?userId= — retire le filigrane : le mois entier recompte. */
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const userId = new URL(request.url).searchParams.get("userId") ?? "";
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  const service = getServiceClient();
  const { error } = await service.from("agent_quota_resets").delete().eq("user_id", userId);
  if (error) {
    console.error("[admin/agent-quota] undo reset failed:", error.message);
    return NextResponse.json({ error: "Undo failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, userId });
}
