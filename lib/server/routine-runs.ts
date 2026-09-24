import "server-only";
import { hydrateWorkerParentCopies } from "@/lib/server/agent/worker-parent-content";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { NumoTurnStatus } from "@/lib/assistant-types";
import { getServiceClient } from "@/lib/supabase-service";
import {
  occurrencesForRoutine,
  type NumoRoutineOccurrence,
} from "@/lib/server/routine-occurrences";
import type { Routine } from "@/lib/server/routines";

/**
 * Read-only Numo access to routine runs (MIN-589). Occurrence rows and their
 * durable turns are read through the service client after the caller's access
 * to the routine was checked (`getRoutineForUser`); the conversation transcript
 * goes through the caller's RLS client, so it stays private to the routine's
 * owner exactly like every other Numo conversation.
 */

/** Transcript clamping lives here so `ROUTINE_RUNS_TOOL_RESULT_CHAR_LIMIT`
 * (declared with the other routine result ceilings in
 * `lib/server/assistant/routine-tool-result.ts`) never truncates mid-run. */
const MAX_TRANSCRIPT_MESSAGES = 120;
const MAX_MESSAGE_CHARS = 1_500;
const MAX_LIST_RUNS = 50;

export interface RoutineRunSummary {
  id: string;
  origin: "scheduled" | "manual";
  scheduled_for: string | null;
  created_at: string;
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  /** Raw durable-turn state; waiting_input means paused for owner validation. */
  numo_status: NumoTurnStatus | null;
  waiting_input: boolean;
  outcome: string | null;
  error_message: string | null;
  cost_usd: number | null;
  started_at: string | null;
  completed_at: string | null;
  conversation_id: string;
  pr_number: number | null;
  pr_url: string | null;
  pr_state: string | null;
}

export interface RoutineOccurrenceDetail {
  occurrence: RoutineRunSummary;
  /** Present when the caller is the routine's owner (RLS-guarded reads). */
  transcript: {
    /** What the occurrence said and decided, oldest first. */
    messages: Array<{ role: string; content: string; created_at: string }>;
    /** Tool calls summarized — the actions, not their raw payloads. */
    actions: Array<{ tool_name: string; summary: string; created_at: string }>;
    truncated: boolean;
  } | null;
  transcript_note: string | null;
}

/** Same mapping as the Routines tab run list. */
export function routineRunStatus(status: NumoTurnStatus | null): RoutineRunSummary["status"] {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "stopped") return "canceled";
  return status ? "running" : "queued";
}

function turnForConversation(
  turns: Array<Record<string, unknown>>,
  conversationId: string,
): Record<string, unknown> | null {
  return turns.find((turn) => turn.conversation_id === conversationId) ?? null;
}

interface OccurrenceContext {
  turns: Array<Record<string, unknown>>;
  workers: Map<string, Record<string, unknown>>;
}

function runSummary(
  occurrence: NumoRoutineOccurrence,
  { turns, workers }: OccurrenceContext,
): RoutineRunSummary {
  const turn = turnForConversation(turns, occurrence.conversation_id);
  const status = (turn?.status as NumoTurnStatus | undefined) ?? null;
  const worker = workers.get(occurrence.conversation_id) ?? null;
  return {
    id: occurrence.id,
    origin: occurrence.origin,
    scheduled_for: occurrence.scheduled_for,
    created_at: occurrence.scheduled_for ?? occurrence.created_at,
    status: occurrence.error_code
      ? "failed"
      : routineRunStatus(status),
    numo_status: status,
    waiting_input: status === "waiting_input",
    outcome: (turn?.outcome as string | null) ?? null,
    error_message: occurrence.error_message ?? (turn?.error_message as string | null) ?? null,
    cost_usd: turn ? Number(turn.cost_usd ?? 0) : null,
    started_at: (turn?.started_at as string | null) ?? null,
    completed_at: (turn?.completed_at as string | null) ?? null,
    conversation_id: occurrence.conversation_id,
    pr_number: (worker?.pr_number as number | null) ?? null,
    pr_url: (worker?.pr_url as string | null) ?? null,
    pr_state: (worker?.pr_state as string | null) ?? null,
  };
}

async function occurrenceContext(
  service: SupabaseClient,
  occurrences: NumoRoutineOccurrence[],
): Promise<OccurrenceContext> {
  const conversationIds = occurrences.map((occurrence) => occurrence.conversation_id);
  const turnResult = conversationIds.length
    ? await service
        .from("numo_assistant_turns")
        .select(
          "id, conversation_id, status, outcome, error_message, cost_usd, started_at, completed_at",
        )
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (turnResult.error) throw new Error(turnResult.error.message);
  const turns = (turnResult.data ?? []) as Array<Record<string, unknown>>;
  const turnIds = turns.map((turn) => turn.id as string);
  const workerResult = turnIds.length
    ? await service
        .from("agent_runs")
        .select("id, parent_numo_turn_id, pr_number, pr_url, pr_state")
        .in("parent_numo_turn_id", turnIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (workerResult.error) throw new Error(workerResult.error.message);
  const turnConversation = new Map<string, string>();
  for (const turn of turns) {
    turnConversation.set(turn.id as string, turn.conversation_id as string);
  }
  const workers = new Map<string, Record<string, unknown>>();
  for (const worker of (workerResult.data ?? []) as Array<Record<string, unknown>>) {
    const conversationId = turnConversation.get(worker.parent_numo_turn_id as string);
    if (conversationId) workers.set(conversationId, worker);
  }
  return { turns, workers };
}

/** Run history of one routine, most recent first. Caller access is checked. */
export async function routineRunSummaries(
  routine: Routine,
  limit = 20,
): Promise<RoutineRunSummary[]> {
  const capped = Math.max(1, Math.min(limit, MAX_LIST_RUNS));
  const occurrences = (await occurrencesForRoutine(routine.id, capped)).reverse();
  const context = await occurrenceContext(getServiceClient(), occurrences);
  return occurrences
    .map((occurrence) => runSummary(occurrence, context))
    .sort(
      (left, right) => Date.parse(right.created_at) - Date.parse(left.created_at),
    );
}

function clampContent(content: unknown): string {
  const text = typeof content === "string" ? content : JSON.stringify(content ?? null);
  if (text.length <= MAX_MESSAGE_CHARS) return text;
  return `${text.slice(0, MAX_MESSAGE_CHARS)}… [truncated]`;
}

/**
 * One occurrence in full. `transcript` comes from the caller's RLS client, so
 * it is present only when the routine's owner asks — for anyone else the tool
 * still exposes the run state, outcome and pull request.
 */
export async function routineOccurrenceDetail(input: {
  routine: Routine;
  occurrence: NumoRoutineOccurrence;
  readClient: SupabaseClient;
}): Promise<RoutineOccurrenceDetail> {
  const context = await occurrenceContext(getServiceClient(), [input.occurrence]);
  const occurrence = runSummary(input.occurrence, context);

  const { data: identity } = await input.readClient
    .from("numo_conversation_ids")
    .select("id")
    .eq("assistant_id", input.occurrence.conversation_id)
    .maybeSingle();
  if (!identity) {
    return {
      occurrence,
      transcript: null,
      transcript_note: "The conversation of this occurrence is not readable here.",
    };
  }

  const { data, error } = await input.readClient
    .from("numo_messages")
    .select("id, source, role, kind, content, metadata, tool_name, created_at")
    .eq("conversation_id", identity.id as string)
    .eq("source", "assistant")
    .neq("role", "tool")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = await hydrateWorkerParentCopies(input.readClient,
    (data ?? []) as Array<Record<string, unknown>>);
  const messages = rows
    .filter((row) => row.kind !== "action")
    .map((row) => ({
      role: String(row.role ?? "assistant"),
      content: clampContent(row.content),
      created_at: String(row.created_at ?? ""),
    }));
  const actions = rows
    .filter((row) => row.kind === "action")
    .map((row) => ({
      tool_name: String(row.tool_name ?? "tool"),
      summary: clampContent(row.content),
      created_at: String(row.created_at ?? ""),
    }));

  const readable = messages.length > 0 || actions.length > 0;
  const truncated = rows.length > MAX_TRANSCRIPT_MESSAGES;
  return {
    occurrence,
    transcript: readable
      ? {
          messages: truncated ? messages.slice(-MAX_TRANSCRIPT_MESSAGES) : messages,
          actions: truncated ? actions.slice(-MAX_TRANSCRIPT_MESSAGES) : actions,
          truncated,
        }
      : null,
    transcript_note: readable
      ? truncated
        ? "Oldest entries were dropped; the conversation continues further back."
        : null
      : "The conversation of this occurrence is private to the routine's owner; only the run state is shown.",
  };
}
