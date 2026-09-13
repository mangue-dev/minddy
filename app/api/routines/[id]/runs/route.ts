import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getRoutineForUser } from "@/lib/server/routines";
import { runsForRoutine } from "@/lib/server/agent/runs";
import { agentRunCanResume } from "@/lib/agent-run-resumability";
import { getResolvedBilling } from "@/lib/server/billing-accounts";
import { routineRunUsagePercent } from "@/lib/routine-run-metrics";
import { occurrencesForRoutine } from "@/lib/server/routine-occurrences";
import { getServiceClient } from "@/lib/supabase-service";
import type { NumoTurnStatus } from "@/lib/assistant-types";

/**
 * Routine execution history. New rows summarize the complete Numo occurrence;
 * pre-migration agent runs remain readable in the same list. Project members
 * may read outcomes, while exact usage percentages remain owner-only.
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

function agentStatusForNumo(status: NumoTurnStatus | null) {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "stopped") return "canceled";
  return status ? "running" : "queued";
}

export async function GET(request: NextRequest, ctx: RouteContext) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const found = await getRoutineForUser(id, auth.user.id);
  if (!found) return NextResponse.json({ error: "routineNotFound" }, { status: 404 });

  const [rows, occurrences, billing] = await Promise.all([
    runsForRoutine(id),
    occurrencesForRoutine(id),
    found.isOwner
      ? getResolvedBilling(found.routine.owner_id)
      : Promise.resolve(null),
  ]);
  const includedUsageUsd = billing?.plan.includedUsageUsd ?? 0;
  const legacyRuns = rows.map((run) => {
    const row = run as unknown as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const field of RUN_FIELDS) out[field] = row[field] ?? null;
    // Set by DB trigger, outside of type `AgentRun` — the list needs it to
    // tell when a passage has ended.
    out.completed_at = row.completed_at ?? null;
    // An exact ratio would let a member derive the owner's plan allowance from
    // the already-visible cost. BYOK also consumes no included Minddy usage.
    out.usage_percent = routineRunUsagePercent({
      costUsd: Number(row.cost_usd ?? 0),
      includedUsageUsd,
      keyMode: row.key_mode === "byok" ? "byok" : "platform",
      isOwner: found.isOwner,
    });
    out.resumable = agentRunCanResume(run);
    out.kind = "legacy_agent";
    out.numo_conversation_id = null;
    out.origin = null;
    out.numo_status = null;
    return out;
  });

  const service = getServiceClient();
  const conversationIds = occurrences.map((occurrence) => occurrence.conversation_id);
  const turnResult = conversationIds.length
    ? await service.from("numo_assistant_turns")
        .select("*")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (turnResult.error) throw new Error(turnResult.error.message);
  const allTurns = (turnResult.data ?? []) as Array<Record<string, unknown>>;
  const turnIds = allTurns.map((turn) => turn.id as string);
  const [workerResult, usageResult] = await Promise.all([
    turnIds.length
      ? service.from("agent_runs")
          .select("id, parent_numo_turn_id, conversation_id, pr_number, pr_url, pr_state")
          .in("parent_numo_turn_id", turnIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    found.isOwner && turnIds.length
      ? service.from("ai_usage")
          .select("numo_turn_id, key_mode, cost")
          .in("numo_turn_id", turnIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (workerResult.error) throw new Error(workerResult.error.message);
  if (usageResult.error) throw new Error(usageResult.error.message);
  const turns = new Map<string, Record<string, unknown>>();
  const turnConversation = new Map<string, string>();
  for (const turn of allTurns) {
    const turnId = turn.id as string;
    const conversationId = turn.conversation_id as string;
    turnConversation.set(turnId, conversationId);
    if (!turns.has(conversationId)) turns.set(conversationId, turn);
  }
  const workers = new Map<string, Record<string, unknown>>();
  for (const worker of (workerResult.data ?? []) as Array<Record<string, unknown>>) {
    const conversationId = turnConversation.get(worker.parent_numo_turn_id as string);
    if (conversationId && !workers.has(conversationId)) {
      workers.set(conversationId, worker);
    }
  }
  const platformSpend = new Map<string, number>();
  for (const usage of (usageResult.data ?? []) as Array<Record<string, unknown>>) {
    if (usage.key_mode !== "platform") continue;
    const conversationId = turnConversation.get(usage.numo_turn_id as string);
    if (!conversationId) continue;
    platformSpend.set(
      conversationId,
      (platformSpend.get(conversationId) ?? 0) + Number(usage.cost ?? 0),
    );
  }

  const numoRuns = occurrences.map((occurrence) => {
    const turn = turns.get(occurrence.conversation_id) ?? null;
    const status = (turn?.status as NumoTurnStatus | undefined) ?? null;
    const worker = workers.get(occurrence.conversation_id) ?? null;
    const createdAt = occurrence.scheduled_for ?? occurrence.created_at;
    return {
      id: occurrence.id,
      kind: "numo",
      project_id: found.routine.project_id,
      issue_id: null,
      pull_request_id: null,
      status: occurrence.error_code ? "failed" : agentStatusForNumo(status),
      numo_status: status,
      model: turn?.model ?? null,
      model_forced: false,
      reasoning_level: turn?.reasoning_level ?? null,
      key_mode: null,
      triggered_by: "routine",
      prompt: found.routine.prompt,
      title: found.routine.title,
      base_branch: null,
      branch_name: null,
      pr_number: worker?.pr_number ?? null,
      pr_url: worker?.pr_url ?? null,
      pr_state: worker?.pr_state ?? null,
      continuations: 0,
      cost_usd: Number(turn?.cost_usd ?? 0),
      outcome: turn?.outcome ?? null,
      error_message: occurrence.error_message ?? turn?.error_message ?? null,
      started_at: turn?.started_at ?? null,
      completed_at: turn?.completed_at ?? null,
      created_at: createdAt,
      updated_at: turn?.updated_at ?? occurrence.updated_at,
      awaiting_input: status === "waiting_input",
      resumable: false,
      origin: occurrence.origin,
      scheduled_for: occurrence.scheduled_for,
      conversation_id: occurrence.conversation_id,
      numo_conversation_id: occurrence.conversation_id,
      work_run_id: worker?.id ?? null,
      usage_percent: found.isOwner && turn
        ? routineRunUsagePercent({
            costUsd: platformSpend.get(occurrence.conversation_id) ?? 0,
            includedUsageUsd,
            keyMode: "platform",
            isOwner: true,
          })
        : null,
    };
  });

  const runs = [...numoRuns, ...legacyRuns].sort(
    (left, right) => Date.parse(String(right.created_at)) - Date.parse(String(left.created_at)),
  );
  return NextResponse.json({ runs });
}
