import { type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { getResolvedBilling } from "@/lib/server/billing-accounts";
import { getUsagePeriod } from "@/lib/server/usage";
import { USAGE_SEGMENTS, type UsageSegmentId } from "@/lib/billing-plans";
import { toUsageHistoryFeature } from "@/lib/usage-features";
import type { UsageHistoryEntry, UsageHistoryResponse } from "@/lib/billing-types";

const PAGE_SIZE = 25;

/** ledger feature → display segment (agent_code AND sandbox_compute → agents). */
function segmentForFeature(feature: string): UsageSegmentId {
  return (
    USAGE_SEGMENTS.find((segment) =>
      (segment.features as readonly string[]).includes(feature)
    )?.id ?? "numo"
  );
}

/**
 * GET /api/billing/usage-history?segment=agents&offset=0 — typed history
 * of the current window (MIN-72, returns): one run of the ledger per entry,
 * grouped by RPC `get_user_usage_history`, filterable by segment.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = request.nextUrl;
  const segmentParam = searchParams.get("segment");
  const segment = USAGE_SEGMENTS.find((s) => s.id === segmentParam) ?? null;
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);

  const billing = await getResolvedBilling(auth.user.id);
  const period = await getUsagePeriod(auth.user.id, billing);

  const service = getServiceClient();
  const { data, error } = await service.rpc("get_user_usage_history", {
    p_user_id: auth.user.id,
    p_since: period.start,
    p_features: segment ? segment.features : null,
    p_limit: PAGE_SIZE,
    p_offset: offset,
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const parsed = (data ?? {}) as {
    total?: number;
    entries?: Array<{
      run_id: string;
      feature: string;
      cost: number | string;
      first_at: string;
      project_name: string | null;
    }>;
  };

  const response: UsageHistoryResponse = {
    total: parsed.total ?? 0,
    entries: (parsed.entries ?? []).map(
      (entry): UsageHistoryEntry => ({
        runId: entry.run_id,
        segmentId: segmentForFeature(entry.feature),
        // The feature as is, so that the line says the gesture and not the
        // family. The PRC keeps `min(feature)` per run: in a mixed run,
        // it is the one that the user recognizes (`agent_code` before
        // `sandbox_compute`, `routine_code` before `routine_compute`).
        feature: toUsageHistoryFeature(entry.feature),
        at: entry.first_at,
        projectName: entry.project_name,
        usd: Number(entry.cost) || 0,
      })
    ),
  };
  return Response.json(response);
}
