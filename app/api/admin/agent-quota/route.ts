import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { getServiceClient } from "@/lib/supabase-service";
import { getAppConfigValue, setAppConfigValue } from "@/lib/server/app-config";
import {
  AGENT_MONTHLY_CAP_CONFIG_KEY,
  AGENT_MONTHLY_CAP_USD_DEFAULT,
} from "@/lib/agent-models";
import { displayName } from "@/lib/display-name";

/**
 * Administration des LIMITES d'usage de l'agent (`/admin` → onglet « Quotas »).
 * Gate identique aux autres endpoints admin : JWT via getClaims + isAdminUser.
 *
 *  GET    → plafond mensuel en vigueur + une ligne par utilisateur ayant consommé
 *           l'agent ce mois-ci (dépense réelle vs dépense comptée par le quota).
 *  POST   { userId }        → remet son quota à zéro (pose le filigrane).
 *  DELETE ?userId=<uuid>    → annule la remise à zéro (le mois entier recompte).
 *  PATCH  { cap }           → change le plafond mensuel global (USD).
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
/** Garde-fou : un plafond négatif bloquerait tout le monde, un plafond absurde ne
 *  protégerait plus rien. */
const CAP_MAX_USD = 10_000;

interface QuotaUsageRow {
  user_id: string;
  spent_month: number;
  spent_counted: number;
  calls: number;
  last_used_at: string;
  reset_at: string | null;
}

async function currentCap(): Promise<number> {
  const raw = await getAppConfigValue(AGENT_MONTHLY_CAP_CONFIG_KEY);
  const parsed = raw != null ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : AGENT_MONTHLY_CAP_USD_DEFAULT;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const service = getServiceClient();
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();

  const [{ data, error }, cap] = await Promise.all([
    service.rpc("get_agent_quota_usage", { p_month_start: monthStart }),
    currentCap(),
  ]);
  if (error) {
    console.error("[admin/agent-quota] get_agent_quota_usage failed:", error.message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const rows = (data ?? []) as QuotaUsageRow[];
  // Nom lisible par utilisateur (jamais l'email brut côté UI, cf. lib/display-name).
  // Une poignée d'utilisateurs par mois → résolution unitaire, pas de listUsers.
  const users = await Promise.all(
    rows.map(async (r) => {
      const { data: u } = await service.auth.admin.getUserById(r.user_id);
      const meta = u?.user?.user_metadata as { full_name?: string } | undefined;
      const spentCounted = Number(r.spent_counted) || 0;
      return {
        userId: r.user_id,
        name: displayName({ full_name: meta?.full_name, email: u?.user?.email }, "—"),
        /** Dépense RÉELLE du mois — analyses, jamais altérée par une remise à zéro. */
        spentMonth: Number(r.spent_month) || 0,
        /** Ce que le plafond compte vraiment (depuis le filigrane). */
        spentCounted,
        calls: Number(r.calls) || 0,
        lastUsedAt: r.last_used_at,
        resetAt: r.reset_at,
        blocked: spentCounted >= cap,
      };
    }),
  );

  return NextResponse.json({ cap, capDefault: AGENT_MONTHLY_CAP_USD_DEFAULT, monthStart, users });
}

/** POST { userId } — pose le filigrane : le quota repart de maintenant. */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  let body: { userId?: unknown };
  try {
    body = (await request.json()) as { userId?: unknown };
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

/** PATCH { cap } — plafond mensuel global (USD), commun à tous les utilisateurs. */
export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  let body: { cap?: unknown };
  try {
    body = (await request.json()) as { cap?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const cap = typeof body.cap === "number" ? body.cap : Number(body.cap);
  if (!Number.isFinite(cap) || cap <= 0 || cap > CAP_MAX_USD) {
    return NextResponse.json(
      { error: `Cap must be between 0 and ${CAP_MAX_USD}` },
      { status: 400 },
    );
  }

  try {
    await setAppConfigValue(AGENT_MONTHLY_CAP_CONFIG_KEY, String(cap));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Save failed";
    console.error("[admin/agent-quota] cap save failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, cap });
}
