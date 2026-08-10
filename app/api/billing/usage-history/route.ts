import { type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { getResolvedBilling } from "@/lib/server/billing-accounts";
import { getUsagePeriod } from "@/lib/server/usage";
import { USAGE_SEGMENTS, type UsageSegmentId } from "@/lib/billing-plans";
import { toUsageHistoryFeature } from "@/lib/usage-features";
import type { UsageHistoryEntry, UsageHistoryResponse } from "@/lib/billing-types";

const PAGE_SIZE = 25;

/** feature du ledger → segment d'affichage (agent_code ET sandbox_compute → agents). */
function segmentForFeature(feature: string): UsageSegmentId {
  return (
    USAGE_SEGMENTS.find((segment) =>
      (segment.features as readonly string[]).includes(feature)
    )?.id ?? "numo"
  );
}

/**
 * GET /api/billing/usage-history?segment=agents&offset=0 — l'historique typé
 * de la fenêtre courante (MIN-72, retours) : un run du ledger par entrée,
 * groupé par la RPC `get_user_usage_history`, filtrable par segment.
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
        // La feature telle quelle, pour que la ligne dise le geste et pas la
        // famille. La RPC garde `min(feature)` par run : dans un run mixte,
        // c'est celle que l'utilisateur reconnaît (`agent_code` avant
        // `sandbox_compute`, `routine_code` avant `routine_compute`).
        feature: toUsageHistoryFeature(entry.feature),
        at: entry.first_at,
        projectName: entry.project_name,
        usd: Number(entry.cost) || 0,
      })
    ),
  };
  return Response.json(response);
}
