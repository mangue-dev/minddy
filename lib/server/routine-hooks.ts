import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { insertNotifications } from "@/lib/server/notifications";
import { afterOrNow } from "@/lib/server/after-safe";
import type { NumoTurn } from "@/lib/server/numo/turns";

/**
 * Observe the parent Numo turn of a routine occurrence. Delegated code is only
 * one intermediate action: the routine is complete, failed, or waiting only
 * when the parent conversation reaches that state.
 */
export function notifyRoutineOfNumoTurn(turn: NumoTurn): void {
  if (!turn.intent.routineId) return;
  if (![
    "completed",
    "failed",
    "stopped",
    "waiting_input",
  ].includes(turn.status)) return;

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

      const failed = turn.status === "failed" || turn.status === "stopped";
      if (turn.status !== "waiting_input") {
        await service
          .from("agent_routines")
          .update({ last_error: failed ? "launchFailed" : null })
          .eq("id", routine.id);
      }

      await insertNotifications(
        service,
        [{
          user_id: routine.owner_id,
          project_id: routine.project_id,
          type: turn.status === "waiting_input"
            ? "agent_question"
            : failed
              ? "agent_failed"
              : "routine_done",
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
