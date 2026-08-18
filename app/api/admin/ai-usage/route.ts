import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * Admin reading of LLM cost tracking (`ai_usage`). Gate identical to the others
 * endpoints admin (`/api/admin/app-config`) : JWT via getClaims + isAdminUser.
 *
 * GET /api/admin/ai-usage
 * ?days=<n> window in days (default 30, bounded 1–365)
 * ?run=<uuid> detail: individual run calls (drill-down)
 *
 * Aggregates are calculated in SQL (`get_ai_usage_stats` / `get_ai_run_calls`)
 * and read via customer service (service_role), the table being in RLS deny-all.
 */

async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!(await isAdminUser(auth.user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const service = getServiceClient();
  const { searchParams } = new URL(request.url);

  // Drill-down: calls for a specific run.
  const run = searchParams.get("run");
  if (run) {
    if (!UUID_RE.test(run)) {
      return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
    }
    const { data, error } = await service.rpc("get_ai_run_calls", { p_run_id: run });
    if (error) {
      console.error("[admin/ai-usage] get_ai_run_calls failed:", error.message);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }
    return NextResponse.json({ calls: data ?? [] });
  }

  // Overview of a window.
  const daysRaw = Number(searchParams.get("days"));
  const days = Number.isFinite(daysRaw) ? Math.min(365, Math.max(1, Math.floor(daysRaw))) : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await service.rpc("get_ai_usage_stats", { p_since: since });
  if (error) {
    console.error("[admin/ai-usage] get_ai_usage_stats failed:", error.message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
  return NextResponse.json({ days, stats: data });
}
