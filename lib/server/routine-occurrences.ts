import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { defaultLocale } from "@/i18n/config";
import { getServiceClient } from "@/lib/supabase-service";
import { startNumoIntent } from "@/lib/server/numo/start-intent";
import type { NumoTurn } from "@/lib/server/numo/turns";
import {
  routineRunBudgetUsd,
  type Routine,
} from "@/lib/server/routines";

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

function occurrenceError(error: unknown): { code: string; message: string } {
  const candidate = error as { code?: unknown; message?: unknown };
  const message = typeof candidate.message === "string"
    ? candidate.message
    : "Numo could not start this routine occurrence.";
  return {
    code: typeof candidate.code === "string"
      ? candidate.code
      : /^[a-z][a-z0-9_]+$/.test(message)
        ? message
        : "numo_unavailable",
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
    p_title: input.routine.title,
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
    return { occurrence, turn: existing as NumoTurn };
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
    return { occurrence, turn: turn as NumoTurn };
  } catch (error) {
    if (!turnCreated) {
      const failure = occurrenceError(error);
      await Promise.all([
        service
          .from("numo_routine_occurrences")
          .update({ error_code: failure.code, error_message: failure.message })
          .eq("id", occurrence.id)
          .is("turn_id", null),
        service
          .from("conversations")
          .update({ status: "error", error_message: failure.message })
          .eq("id", occurrence.conversation_id),
      ]);
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
  return (data ?? []) as NumoRoutineOccurrence[];
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

  const cap = await routineRunBudgetUsd(routine as Routine);
  if (cap == null) {
    return {
      occurrence: occurrence as NumoRoutineOccurrence,
      routine: routine as Routine,
      remainingBudgetUsd: null,
    };
  }
  const { data: turns, error: turnsError } = await service
    .from("numo_assistant_turns")
    .select("id")
    .eq("conversation_id", conversationId);
  if (turnsError) throw new Error(turnsError.message);
  const turnIds = (turns ?? []).map((turn) => turn.id as string);
  let spent = 0;
  if (turnIds.length > 0) {
    const { data: usage, error: usageError } = await service
      .from("ai_usage")
      .select("cost")
      .in("numo_turn_id", turnIds);
    if (usageError) throw new Error(usageError.message);
    spent = (usage ?? []).reduce((total, row) => total + Number(row.cost ?? 0), 0);
  }
  return {
    occurrence: occurrence as NumoRoutineOccurrence,
    routine: routine as Routine,
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
        routine: routine as Routine,
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
