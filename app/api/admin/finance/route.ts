import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { getFinanceSummary } from "@/lib/server/finance";
import { sweepOrphanKeys } from "@/lib/server/managed-ai-key";
import { isManagedAiEnabled, managedAiKeyMode } from "@/lib/managed-services";

/**
 * Admin Reading of Finances Page (MIN-92) — AI Costs and Entries
 * money on the same axis. Gate identical to other admin endpoints
 * (`/api/admin/ai-usage`) : JWT via getClaims + isAdminUser.
 *
 * GET /api/admin/finance
 * ?days=<n> window in days (default 30, bounded 1–365)
 * ?refresh=1 bypasses server cache and retypes Stripe
 *
 * Stripe is queried EACH load, behind a cache of a few
 * minutes: no mirror table, Stripe remains the only source of truth and it
 * there is nothing to resynchronize. The “Refresh” button on the screen is what
 * pose `refresh=1`.
 */

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!(await isAdminUser(auth.user, auth.claims))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const daysRaw = Number(searchParams.get("days") ?? 30);
  const days = Number.isFinite(daysRaw)
    ? Math.min(365, Math.max(1, Math.floor(daysRaw)))
    : 30;
  const refresh = searchParams.get("refresh") === "1";

  try {
    const summary = await getFinanceSummary({ days, refresh });
    return NextResponse.json(summary, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("[admin/finance] failed:", (err as Error).message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}

/**
 * POST /api/admin/finance { action: "sweep_orphan_keys" } — deletes at
 * OpenRouter the per-account keys (MIN-761) that no account references any
 * more. Only keys Minddy issued are considered; the response counts them.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!(await isAdminUser(auth.user, auth.claims))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let action: unknown;
  try {
    action = ((await request.json()) as { action?: unknown } | null)?.action;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (action !== "sweep_orphan_keys") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  if (!isManagedAiEnabled() || managedAiKeyMode() !== "per_user") {
    return NextResponse.json({ error: "Per-account keys are not enabled" }, { status: 409 });
  }

  try {
    const result = await sweepOrphanKeys();
    console.info("[admin/finance] orphan key sweep", result);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("[admin/finance] orphan key sweep failed:", (err as Error).message);
    return NextResponse.json({ error: "Sweep failed" }, { status: 502 });
  }
}
