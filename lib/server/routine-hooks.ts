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

      const { data: delegated } = await service
        .from("agent_runs")
        .select("id, conversation_id, pr_number")
        .eq("parent_numo_turn_id", turn.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      await insertNotifications(
        service,
        [{
          user_id: routine.owner_id,
          project_id: routine.project_id,
          type: turn.status === "waiting_input"
            ? "agent_question"
            : failed
              ? "agent_failed"
              : delegated?.pr_number != null ? "agent_done" : "routine_done",
          issue_id: null,
          routine_id: routine.id,
          agent_conversation_id: delegated?.conversation_id ?? null,
          numo_conversation_id: occurrence.conversation_id,
          numo_work_id: delegated?.id ?? null,
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
 * The END OF PASS hook of a routine (MIN-185).
 *
 * Module separately — and not in `lib/server/routines.ts` — so that
 * `lib/server/agent/runs.ts` can call it without dragging the
 behind it * manufactures, its model ceiling and its quota. Same division as the hooks
 * for automation (`lib/server/automations/hooks.ts`), and for the same reason:
 * the call point is at the lowest of the stack.
 *
 * **All end of passage is said**, with the word that corresponds to it: a pull open request
 * (`agent_done`), a failed pass (`agent_failed`), and otherwise the
 * completed pass itself (`routine_done`). The latter was missing, and its absence
 * was not visible: a routine that ran well without pushing anything was
 * indistinguishable from a dead routine — you had to open your screen to see it
 * know.
 *
 * What keeps it liveable is `replaceUnread`: all four types move each other, so a daily routine leaves ONE line unread,
 * not one per morning. The details of each passage remain in “Previous Executions
 *”, which is made for that.
 *
 * A CANCELED passage says nothing: it has not finished, and announcing it “finished”
 * would be false. If he still left a pull request, this one speaks.
 */
export async function notifyRoutineOfRunEnd(run: {
  id: string;
  routine_id: string | null;
  project_id: string;
  status: string;
  pr_number: number | null;
  awaiting_input?: boolean;
}): Promise<void> {
  if (!run.routine_id) return;
  const openedPr = run.pr_number != null;
  const failed = run.status === "failed";
  const completed = run.status === "completed";
  if (!openedPr && !failed && !completed) return;

  try {
    const service = getServiceClient();
    const { data } = await service
      .from("agent_routines")
      .select("id, owner_id")
      // Trash being passed (MIN-201): the inbox line would lead to
      // a screen which responds 404, and would announce the work of a routine that its
      // owner just deleted.
      .is("deleted_at", null)
      .eq("id", run.routine_id)
      .maybeSingle();
    const owner = (data as { owner_id?: string } | null)?.owner_id;
    if (!owner) return;

    await insertNotifications(
      service,
      [
        {
          user_id: owner,
          project_id: run.project_id,
          type: run.awaiting_input
            ? "agent_question"
            : failed
              ? "agent_failed"
              : openedPr ? "agent_done" : "routine_done",
          issue_id: null,
          // The target is the ROUTINE: this is where its executions are read, and
          // nowhere else. Without this field, the inbox line would not lead
          // nowhere and would be discarded when displayed.
          routine_id: run.routine_id,
          actor_id: null,
        },
      ],
      // Only one VIVATE agent notification per routine: three failures
      // in a row make one line, not three — it's the same problem.
      { replaceUnread: true },
    );
  } catch (err) {
    console.error("[routine-hooks] notify failed:", (err as Error).message);
  }
}

/**
 * Writes on the routine what its last pass gave. Called from the same
 * obligatory passage as the notification: `last_error` to `null` when the run
 * succeeds — the screen alert must turn off by itself as soon as the routine
 * starts again —, to the code `launchFailed` when it fails.
 */
export async function stampRoutineRunEnd(run: {
  routine_id: string | null;
  status: string;
}): Promise<void> {
  if (!run.routine_id) return;
  if (run.status !== "completed" && run.status !== "failed") return;
  try {
    const service = getServiceClient();
    const { error } = await service
      .from("agent_routines")
      .update({ last_error: run.status === "failed" ? "launchFailed" : null })
      .eq("id", run.routine_id);
    if (error) console.error("[routine-hooks] stamp failed:", error.message);
  } catch (err) {
    console.error("[routine-hooks] stamp threw:", (err as Error).message);
  }
}
