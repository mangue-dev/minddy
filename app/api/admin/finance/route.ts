import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { getFinanceSummary } from "@/lib/server/finance";

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
  if (!(await isAdminUser(auth.user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const daysRaw = Number(searchParams.get("days"));
  const days = Number.isFinite(daysRaw)
    ? Math.min(365, Math.max(1, Math.floor(daysRaw)))
    : 30;
  const refresh = searchParams.get("refresh") === "1";

  try {
    const summary = await getFinanceSummary({ days, refresh });
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[admin/finance] failed:", (err as Error).message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}
