import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { loadJevDecisionSettings } from "@/lib/server/decisions/runner";
import { getServiceClient } from "@/lib/supabase-service";
import type { AdminDecisionsQualityWeek } from "@/lib/types";

/**
 * `/admin` → “AI decisions” section (MIN-567). Gate identical to the other
 * admin endpoints: JWT via getClaims + isAdminUser.
 *
 * GET → the Jev decision knobs as they stand (`jev_confidence_floor`,
 * `jev_shadow_sample_rate`, the LLM-first list) and the shadow comparison
 * aggregated PER USE CASE AND WEEK — computed in the database by the
 * `ai_decision_evaluations_weekly` view (a plain read of the ledger would
 * be capped by PostgREST), newest week first.
 */

const MAX_WEEKLY_ROWS = 400;

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!(await isAdminUser(auth.user, auth.claims))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const service = getServiceClient();
  const [weeklyRes, settings] = await Promise.all([
    service
      .from("ai_decision_evaluations_weekly")
      .select("*")
      .order("week_start", { ascending: false })
      .limit(MAX_WEEKLY_ROWS),
    loadJevDecisionSettings(),
  ]);

  if (weeklyRes.error) {
    console.error("[admin/decisions-quality] weekly failed:", weeklyRes.error.message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const weeks: AdminDecisionsQualityWeek[] = (weeklyRes.data ?? []).map(
    (row: Record<string, unknown>) => ({
      useCase: String(row.use_case),
      weekStart: new Date(String(row.week_start)).toISOString(),
      samples: Number(row.samples) || 0,
      comparable: Number(row.comparable) || 0,
      agreeCount: Number(row.agree_count) || 0,
      replayFailed: Number(row.replay_failed) || 0,
      jevLatencySum: Number(row.jev_latency_sum) || 0,
      jevLatencyCount: Number(row.jev_latency_count) || 0,
      llmLatencySum: Number(row.llm_latency_sum) || 0,
      llmLatencyCount: Number(row.llm_latency_count) || 0,
      llmCostSum: Number(row.llm_cost_sum) || 0,
      llmCostCount: Number(row.llm_cost_count) || 0,
    })
  );

  return NextResponse.json({
    settings: {
      enabled: settings.enabled,
      confidenceFloor: settings.confidenceFloor,
      shadowSampleRate: settings.shadowSampleRate,
      llmFirstUseCases: settings.llmFirstUseCases,
    },
    weeks,
  });
}
