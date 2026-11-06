import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { insertNotifications } from "@/lib/server/notifications";
import { afterOrNow } from "@/lib/server/after-safe";
import type { NumoTurn } from "@/lib/server/numo/turns";

/**
 * Observe the parent Numo turn of a routine occurrence. Delegated code is only
 * one intermediate action: the routine is complete, failed, or waiting only
 * when the parent conversation reaches that state.
 *
 * A successful run notifies nobody (MIN-924): when it finds something worth
 * reading, the routine writes its own note with `notify_me`. A run that
 * failed, was stopped or ran out of budget cannot say so itself, and a run
 * waiting for an answer stays blocked until the owner sees it, so those three
 * still notify the owner automatically.
 */
export function notifyRoutineOfNumoTurn(
  turn: NumoTurn,
  options: { usageExhausted?: boolean } = {},
): void {
  if (!turn.intent.routineId) return;
  if (![
    "completed",
    "failed",
    "stopped",
    "waiting_input",
  ].includes(turn.status)) return;

  const usageExhausted = turn.status === "completed" && options.usageExhausted === true;
  const failed = turn.status === "failed" || turn.status === "stopped" || usageExhausted;
  const waiting = turn.status === "waiting_input";

  afterOrNow(async () => {
    try {
      const service = getServiceClient();
      const { data: occurrence } = await service
        .from("numo_routine_occurrences")
        .select("id, routine_id, conversation_id")
        .eq("conversation_id", turn.conversation_id)
        .maybeSingle();
      if (!occurrence) return;
      const { data: routine } = await service
        .from("agent_routines")
        .select("id, owner_id, project_id")
        .eq("id", occurrence.routine_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (!routine?.owner_id) return;

      if (!waiting) {
        await service
          .from("agent_routines")
          .update({ last_error: usageExhausted ? "quota" : failed ? "launchFailed" : null })
          .eq("id", routine.id);
      }
      if (!failed && !waiting) return;

      await insertNotifications(
        service,
        [{
          user_id: routine.owner_id,
          project_id: routine.project_id,
          type: waiting ? "agent_question" : "agent_failed",
          issue_id: null,
          routine_id: routine.id,
          // The routine itself is the notification target.
          actor_id: null,
          via_assistant: true,
        }],
        { replaceUnread: true },
      );
    } catch (error) {
      console.error("[routine-hooks] Numo occurrence notification failed:", error);
    }
  });
}

/**
 * A routine whose run could not even start (no budget left, Numo unavailable)
 * has no conversation to report from, so the owner hears it from here. Call it
 * only when the routine goes from healthy to failing: the scheduler and the
 * event queue retry, and every retry must not notify again.
 */
export function notifyRoutineLaunchFailure(routine: {
  id: string;
  owner_id: string | null;
  project_id: string;
}): void {
  if (!routine.owner_id) return;
  const ownerId = routine.owner_id;
  afterOrNow(async () => {
    try {
      await insertNotifications(
        getServiceClient(),
        [{
          user_id: ownerId,
          project_id: routine.project_id,
          type: "agent_failed",
          issue_id: null,
          routine_id: routine.id,
          actor_id: null,
          via_assistant: true,
        }],
        { replaceUnread: true },
      );
    } catch (error) {
      console.error("[routine-hooks] Routine launch failure notification failed:", error);
    }
  });
}

/** Opportunistic wakeup only; source mutations are journaled transactionally. */
export function scheduleRoutineEvents(): void {
  afterOrNow(async () => {
    try {
      const { processRoutineEvents } = await import("@/lib/server/routine-event-processing");
      await processRoutineEvents(10);
    } catch (error) {
      console.error("[routine-hooks] Event processing deferred to cron:", error);
    }
  });
}
