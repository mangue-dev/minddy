import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getRoutineForUser } from "@/lib/server/routines";
import { getResolvedBilling } from "@/lib/server/billing-accounts";
import { routineRunUsagePercent } from "@/lib/routine-run-metrics";
import { occurrencesForRoutine } from "@/lib/server/routine-occurrences";
import { routineOccurrenceSpend } from "@/lib/server/routine-spend";
import { getServiceClient } from "@/lib/supabase-service";
import type { NumoTurnStatus } from "@/lib/assistant-types";
import { decodeNumoError } from "@/lib/server/numo/error-content";
import { decodeNumoTurnOutcome } from "@/lib/server/numo/final-content";

/**
 * Routine execution history: one row per Numo occurrence. Project members may
 * read outcomes, while exact usage percentages remain owner-only.
 */

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

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

  const [occurrences, billing] = await Promise.all([
    occurrencesForRoutine(id),
    found.isOwner
      ? getResolvedBilling(found.routine.owner_id)
      : Promise.resolve(null),
  ]);
  const includedUsageUsd = billing?.plan.includedUsageUsd ?? 0;
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
  const spend = await routineOccurrenceSpend(service, conversationIds);
  const turns = new Map<string, Record<string, unknown>>();
  for (const turn of allTurns) {
    const conversationId = turn.conversation_id as string;
    if (!turns.has(conversationId)) turns.set(conversationId, turn);
  }
  const numoRuns = await Promise.all(occurrences.map(async (occurrence) => {
    const turn = turns.get(occurrence.conversation_id) ?? null;
    const status = (turn?.status as NumoTurnStatus | undefined) ?? null;
    const createdAt = occurrence.scheduled_for ?? occurrence.created_at;
    return {
      id: occurrence.id,
      kind: "numo",
      project_id: found.routine.project_id,
      issue_id: null,
      status: occurrence.error_code ? "failed" : agentStatusForNumo(status),
      numo_status: status,
      model: turn?.model ?? null,
      model_forced: false,
      reasoning_level: turn?.reasoning_level ?? null,
      key_mode: null,
      triggered_by: "routine",
      prompt: found.routine.prompt,
      title: found.routine.title,
      cost_usd: spend.get(occurrence.conversation_id)?.totalUsd ?? 0,
      outcome: turn ? await decodeNumoTurnOutcome(found.routine.owner_id,
        turn.id as string, turn.outcome as string | null, auth.user.id) : null,
      error_message: occurrence.error_message ?? (turn
        ? await decodeNumoError(found.routine.owner_id,
            "numo_assistant_turns", turn.id as string,
            turn.error_message as string | null, auth.user.id)
        : null),
      started_at: turn?.started_at ?? null,
      completed_at: turn?.completed_at ?? null,
      created_at: createdAt,
      updated_at: turn?.updated_at ?? occurrence.updated_at,
      awaiting_input: status === "waiting_input",
      origin: occurrence.origin,
      event_id: occurrence.event_id ?? null,
      subject_id: occurrence.subject_id ?? null,
      subject_type: occurrence.subject_type ?? null,
      scheduled_for: occurrence.scheduled_for,
      conversation_id: occurrence.conversation_id,
      numo_conversation_id: occurrence.conversation_id,
      usage_percent: found.isOwner && turn
        ? routineRunUsagePercent({
            costUsd: spend.get(occurrence.conversation_id)?.platformUsd ?? 0,
            includedUsageUsd,
            keyMode: "platform",
            isOwner: true,
          })
        : null,
    };
  }));

  const runs = numoRuns.sort(
    (left, right) => Date.parse(String(right.created_at)) - Date.parse(String(left.created_at)),
  );
  return NextResponse.json({ runs });
}
