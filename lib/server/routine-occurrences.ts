import "server-only";
import { encodeConversationTitle, shouldProtectConversationTitle } from
  "@/lib/server/numo/conversation-title-content";
import { shouldProtectNumoUserMessages } from
  "@/lib/server/numo/user-message-content";
import { shouldProtectNumoTurnIntent } from
  "@/lib/server/numo/turn-intent-content";
import { shouldProtectNumoTurnEvents } from
  "@/lib/server/numo/turn-event-content";
import { shouldProtectNumoToolContent } from
  "@/lib/server/numo/tool-content";
import { shouldProtectNumoFinalContent } from
  "@/lib/server/numo/final-content";

import { routineOccurrenceSpend } from "./routine-spend";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { defaultLocale } from "@/i18n/config";
import { getServiceClient } from "@/lib/supabase-service";
import { startNumoIntent } from "@/lib/server/numo/start-intent";
import { hydrateNumoTurn, type NumoTurn } from "@/lib/server/numo/turns";
import { decodeNumoError, encodeNumoError,
  shouldProtectNumoErrors } from "@/lib/server/numo/error-content";
import {
  routineRunBudgetUsd,
  type Routine,
} from "@/lib/server/routines";
import { decodeRoutine, shouldProtectRoutines } from
  "@/lib/server/routine-content";

async function requireProtectedRoutineCopies(service: SupabaseClient) {
  if (!await shouldProtectRoutines(service)) return;
  const ready = await Promise.all([
    shouldProtectConversationTitle(service),
    shouldProtectNumoUserMessages(service),
    shouldProtectNumoTurnIntent(service),
    shouldProtectNumoTurnEvents(service),
    shouldProtectNumoToolContent(service),
    shouldProtectNumoFinalContent(service),
    shouldProtectNumoErrors(service),
  ]);
  if (ready.some((protectedCopy) => !protectedCopy)) {
    throw new Error("Routine occurrence copies require protected Numo paths");
  }
}

export type RoutineOccurrenceOrigin = "scheduled" | "manual";

export interface NumoRoutineOccurrence {
  id: string;
  routine_id: string;
  origin: RoutineOccurrenceOrigin;
  scheduled_for: string | null;
  conversation_id: string;
  request_id: string;
  turn_id: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

function composite<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return (value as T | null) ?? null;
}

async function readableOccurrence(row: NumoRoutineOccurrence, userId: string) {
  return { ...row, error_message: await decodeNumoError(userId,
    "numo_routine_occurrences", row.id, row.error_message) };
}

function occurrenceError(error: unknown): { code: string; message: string } {
  const candidate = error as { code?: unknown; message?: unknown };
  const message = typeof candidate.message === "string"
    ? candidate.message
    : "Numo could not start this routine occurrence.";
  return {
    code: candidate.code === "usage_budget_exceeded"
      || message === "usage_budget_exceeded"
      ? "usage_budget_exceeded" : "numo_unavailable",
    message,
  };
}

async function ownerIdentity(userId: string): Promise<{
  locale: string;
  metadata: Record<string, unknown> | null;
}> {
  const { data } = await getServiceClient().auth.admin.getUserById(userId);
  const metadata = (data?.user?.user_metadata ?? null) as Record<string, unknown> | null;
  const locale = typeof metadata?.locale === "string" ? metadata.locale : defaultLocale;
  return { locale, metadata };
}

/**
 * Admit one routine occurrence through the canonical durable Numo entry.
 * Scheduled retries reuse their claimed due timestamp; manual retries reuse
 * the caller's request id. Neither path launches a code worker directly.
 */
export async function startRoutineOccurrence(input: {
  routine: Routine;
  origin: RoutineOccurrenceOrigin;
  scheduledFor?: string | null;
  requestId?: string;
  readClient?: SupabaseClient;
}): Promise<{ occurrence: NumoRoutineOccurrence; turn: NumoTurn }> {
  const service = getServiceClient();
  await requireProtectedRoutineCopies(service);
  const requestId = input.requestId ?? randomUUID();
  const scheduledFor = input.origin === "scheduled"
    ? input.scheduledFor ?? input.routine.next_run_at
    : null;
  if (input.origin === "scheduled" && !scheduledFor) {
    throw new Error("A scheduled routine occurrence requires its claimed due time");
  }

  const { data, error } = await service.rpc("ensure_numo_routine_occurrence", {
    p_routine_id: input.routine.id,
    p_user_id: input.routine.owner_id,
    p_origin: input.origin,
    p_scheduled_for: scheduledFor,
    p_request_id: requestId,
    p_title: await shouldProtectConversationTitle(service)
      ? await encodeConversationTitle(input.routine.owner_id,
        requestId, input.routine.title.trim().slice(0, 200)) : input.routine.title,
  });
  if (error) throw new Error(error.message);
  let occurrence = composite<NumoRoutineOccurrence>(data);
  if (!occurrence) throw new Error("Routine occurrence reservation failed");

  if (occurrence.turn_id) {
    const { data: existing, error: turnError } = await service
      .from("numo_assistant_turns")
      .select("*")
      .eq("id", occurrence.turn_id)
      .single();
    if (turnError || !existing) throw new Error(turnError?.message ?? "Routine turn not found");
    return { occurrence: await readableOccurrence(occurrence,
      input.routine.owner_id), turn: await hydrateNumoTurn(existing as NumoTurn) };
  }

  let turnCreated = false;
  try {
    const identity = await ownerIdentity(input.routine.owner_id);
    const budgetUsd = await routineRunBudgetUsd(input.routine);
    const started = await startNumoIntent({
      supabase: input.readClient ?? service,
      userId: input.routine.owner_id,
      userMetadata: identity.metadata,
      projectId: input.routine.project_id,
      prompt: input.routine.prompt,
      locale: identity.locale,
      timezone: input.routine.timezone,
      source: "routine",
      action: "custom",
      context: {
        projectId: input.routine.project_id,
        routineId: input.routine.id,
        routineTitle: input.routine.title,
      },
      mentions: input.routine.prompt_mentions,
      conversationId: occurrence.conversation_id,
      conversationUserId: input.routine.owner_id,
      requestId: occurrence.request_id,
      executeInBackground: false,
      triggerSource: "chat",
      routine: {
        id: input.routine.id,
        origin: input.origin,
        scheduledFor,
        budgetUsd,
        budgetPercent: input.routine.max_spend_percent,
      },
    });
    turnCreated = true;

    const { data: bound, error: bindError } = await service
      .from("numo_routine_occurrences")
      .update({
        turn_id: started.turnId,
        error_code: null,
        error_message: null,
      })
      .eq("id", occurrence.id)
      .is("turn_id", null)
      .select("*")
      .maybeSingle();
    if (bindError) throw new Error(bindError.message);
    if (bound) occurrence = bound as NumoRoutineOccurrence;
    else {
      const { data: raced } = await service
        .from("numo_routine_occurrences")
        .select("*")
        .eq("id", occurrence.id)
        .single();
      occurrence = raced as NumoRoutineOccurrence;
    }
    const { data: turn, error: turnError } = await service
      .from("numo_assistant_turns")
      .select("*")
      .eq("id", occurrence.turn_id ?? started.turnId)
      .single();
    if (turnError || !turn) throw new Error(turnError?.message ?? "Routine turn not found");
    return { occurrence: await readableOccurrence(occurrence,
      input.routine.owner_id), turn: await hydrateNumoTurn(turn as NumoTurn) };
  } catch (error) {
    if (!turnCreated) {
      const failure = occurrenceError(error);
      const protect = await shouldProtectNumoErrors(service);
      const [occurrenceErrorMessage, conversationErrorMessage] = protect
        ? await Promise.all([
            encodeNumoError(input.routine.owner_id, "numo_routine_occurrences",
              occurrence.id, failure.message),
            encodeNumoError(input.routine.owner_id, "conversations",
              occurrence.conversation_id, failure.message),
          ]) : [failure.message, failure.message];
      const failed = await service.rpc("fail_numo_routine_occurrence", {
        p_id: occurrence.id, p_old_turn_id: null, p_code: failure.code,
        p_occurrence_error: occurrenceErrorMessage,
        p_conversation_error: conversationErrorMessage,
      });
      if (failed.error) throw new Error(failed.error.message, { cause: error });
    }
    throw error;
  }
}

export async function occurrencesForRoutine(
  routineId: string,
  limit = 50,
): Promise<NumoRoutineOccurrence[]> {
  const { data, error } = await getServiceClient()
    .from("numo_routine_occurrences")
    .select("*")
    .eq("routine_id", routineId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as NumoRoutineOccurrence[];
  if (!rows.length) return rows;
  const { data: routine, error: ownerError } = await getServiceClient()
    .from("agent_routines").select("owner_id").eq("id", routineId).single();
  if (ownerError || !routine?.owner_id) throw new Error("Routine owner unavailable");
  return Promise.all(rows.map((row) => readableOccurrence(row,
    routine.owner_id)));
}

/** Resolve the routine lineage of a user reply in an occurrence conversation. */
export async function routineContinuationForConversation(
  conversationId: string,
  userId: string,
): Promise<{
  occurrence: NumoRoutineOccurrence;
  routine: Routine;
  remainingBudgetUsd: number | null;
} | null> {
  const service = getServiceClient();
  const { data: occurrence, error } = await service
    .from("numo_routine_occurrences")
    .select("*")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!occurrence) return null;
  const { data: routine, error: routineError } = await service
    .from("agent_routines")
    .select("*")
    .eq("id", occurrence.routine_id)
    .eq("owner_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (routineError) throw new Error(routineError.message);
  if (!routine) return null;
  const decodedOccurrence = await readableOccurrence(occurrence as NumoRoutineOccurrence,
    routine.owner_id);

  const plainRoutine = await decodeRoutine(routine, userId) as unknown as Routine;
  const cap = await routineRunBudgetUsd(plainRoutine);
  if (cap == null) {
    return {
      occurrence: decodedOccurrence,
      routine: plainRoutine,
      remainingBudgetUsd: null,
    };
  }
  const spend = await routineOccurrenceSpend(service, [conversationId]);
  const spent = spend.get(conversationId)?.totalUsd ?? 0;
  return {
    occurrence: decodedOccurrence,
    routine: plainRoutine,
    remainingBudgetUsd: Math.max(0, cap - spent),
  };
}

/** Re-admit reservations left between conversation creation and turn binding. */
export async function recoverPendingRoutineOccurrences(limit = 10): Promise<number> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("numo_routine_occurrences")
    .select("*")
    .is("turn_id", null)
    .is("error_code", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  let recovered = 0;
  for (const occurrence of (data ?? []) as NumoRoutineOccurrence[]) {
    const { data: routine, error: routineError } = await service
      .from("agent_routines")
      .select("*")
      .eq("id", occurrence.routine_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (routineError) throw new Error(routineError.message);
    if (!routine) continue;
    try {
      await startRoutineOccurrence({
        routine: await decodeRoutine(routine, routine.owner_id) as unknown as Routine,
        origin: occurrence.origin,
        scheduledFor: occurrence.scheduled_for,
        requestId: occurrence.request_id,
        readClient: service,
      });
      recovered++;
    } catch (recoveryError) {
      console.error(
        `[routine-occurrences] ${occurrence.id} recovery failed:`,
        recoveryError,
      );
    }
  }
  return recovered;
}
