import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getRoutineForUser } from "@/lib/server/routines";
import { runsForRoutine } from "@/lib/server/agent/runs";
import { agentRunCanResume } from "@/lib/agent-run-resumability";
import { getResolvedBilling } from "@/lib/server/billing-accounts";
import { routineRunUsagePercent } from "@/lib/routine-run-metrics";

/**
 * The “Previous Executions” of a Routine (MIN-185) — the ONLY place where
 * his runs are readable. They come out of `/api/agent-runs`: without that, a routine
 * daily would drown out the column of conversations in a week.
 *
 * Reading open to project members, like the routine itself.
 */

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** Client-safe columns — never checkpoint or sandbox_id. Same shape
 as `AgentRunSummary`, so that the events thread is reused as is. */
const RUN_FIELDS = [
  "id",
  "project_id",
  "issue_id",
  "pull_request_id",
  "status",
  "model",
  "model_forced",
  "reasoning_level",
  "key_mode",
  "triggered_by",
  "prompt",
  "title",
  "base_branch",
  "branch_name",
  "pr_number",
  "pr_url",
  "pr_state",
  "continuations",
  "cost_usd",
  "outcome",
  "error_message",
  "started_at",
  "created_at",
  "updated_at",
  "awaiting_input",
] as const;

export async function GET(request: NextRequest, ctx: RouteContext) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const found = await getRoutineForUser(id, auth.user.id);
  if (!found) return NextResponse.json({ error: "routineNotFound" }, { status: 404 });

  const [rows, billing] = await Promise.all([
    runsForRoutine(id),
    getResolvedBilling(found.routine.owner_id),
  ]);
  const includedUsageUsd = billing.plan.includedUsageUsd;
  const runs = rows.map((run) => {
    const row = run as unknown as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const field of RUN_FIELDS) out[field] = row[field] ?? null;
    // Set by DB trigger, outside of type `AgentRun` — the list needs it to
    // tell when a passage has ended.
    out.completed_at = row.completed_at ?? null;
    // BYOK is deliberately shown as unavailable: it does not consume the
    // owner's included Minddy usage budget. The plan amount itself stays server-side.
    out.usage_percent = routineRunUsagePercent(
      Number(row.cost_usd ?? 0),
      includedUsageUsd,
      row.key_mode === "byok" ? "byok" : "platform",
    );
    out.resumable = agentRunCanResume(run);
    return out;
  });
  return NextResponse.json({ runs });
}
