"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ConfirmDeleteDialog, toast } from "mangue-ui";
import { useTranslations } from "next-intl";
import {
  deleteRoutineApi,
  runRoutineNowApi,
  updateRoutineApi,
  type Routine,
} from "@/lib/routines-api";
import {
  patchRoutineInCache,
  routineRunsQueryKey,
  routinesQueryKey,
} from "@/lib/use-routines-query";
import { nextRunAt } from "@/lib/routine-schedule";

/**
 * The one-gesture routine mutations — switch, run now, move to trash —
 * shared by the routine pane and the sidebar's right-click menu (MIN-685),
 * so both write the same way and say the same things.
 *
 * Pending state is kept PER ROUTINE: launching one routine from the list
 * must not gray out another one's pane, and a second click on the same
 * routine while its launch or deletion is in flight does nothing.
 */
export function useRoutineActions({
  schedulingConfigured,
}: {
  /** Whether this instance can schedule routines; pausing never needs it. */
  schedulingConfigured: boolean;
}) {
  const t = useTranslations("Routines");
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const pendingRef = useRef(new Set<string>());
  const toggleSeq = useRef(new Map<string, number>());

  const track = useCallback(async <T,>(routineId: string, work: () => Promise<T>) => {
    if (pendingRef.current.has(routineId)) return undefined;
    pendingRef.current.add(routineId);
    setPending(new Set(pendingRef.current));
    try {
      return await work();
    } finally {
      pendingRef.current.delete(routineId);
      setPending(new Set(pendingRef.current));
    }
  }, []);

  /**
   * The switch flips AT ONCE: the cache is written first (the column and the
   * pane read the same entry), then the request goes out, and the snapshot
   * from before comes back if the server refuses. `next_run_at` follows with
   * the same function as the server, so the "next run" line never jumps.
   * Only the latest toggle of a routine may write its answer: two quick
   * clicks must not end up reversed.
   */
  const toggleEnabled = useCallback(
    (routine: Routine, enabled: boolean) => {
      if (enabled && !schedulingConfigured) {
        toast.error(t("unavailableScheduler"));
        return;
      }
      const seq = (toggleSeq.current.get(routine.id) ?? 0) + 1;
      toggleSeq.current.set(routine.id, seq);
      const previous = patchRoutineInCache(queryClient, routine.id, {
        enabled,
        next_run_at: optimisticNextRunAt(routine, enabled),
      });
      void updateRoutineApi(routine.id, { enabled })
        .then(({ routine: saved }) => {
          if (seq === toggleSeq.current.get(routine.id))
            patchRoutineInCache(queryClient, saved.id, saved);
        })
        .catch((err) => {
          if (seq !== toggleSeq.current.get(routine.id)) return;
          if (previous) queryClient.setQueryData(routinesQueryKey(), previous);
          toast.error((err as Error).message);
        });
    },
    [queryClient, schedulingConfigured, t],
  );

  const runNow = useCallback(
    (routine: Routine) =>
      track(routine.id, async () => {
        try {
          await runRoutineNowApi(routine.id);
          // The run has just been born: the run list does not know it yet.
          await queryClient.invalidateQueries({
            queryKey: routineRunsQueryKey(routine.id),
          });
          toast.success(t("runStarted"));
        } catch (err) {
          toast.error((err as Error).message);
        }
      }),
    [queryClient, t, track],
  );

  /** Resolves `true` once the routine is in the trash. */
  const remove = useCallback(
    async (routine: Routine) =>
      (await track(routine.id, async () => {
        try {
          await deleteRoutineApi(routine.id);
          await queryClient.invalidateQueries({ queryKey: routinesQueryKey() });
          return true;
        } catch (err) {
          toast.error((err as Error).message);
          return false;
        }
      })) ?? false,
    [queryClient, track],
  );

  const isPending = useCallback((routineId: string) => pending.has(routineId), [pending]);

  return { toggleEnabled, runNow, remove, isPending };
}

/** The confirmation before a routine goes to the trash, shared by pane and list. */
export function RoutineTrashDialog({
  routine,
  open,
  onOpenChange,
  onConfirm,
}: {
  routine: Pick<Routine, "title"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("Routines");
  const tCommon = useTranslations("Common");
  // The title keeps naming the routine while the dialog animates out.
  const shown = useRef(routine);
  if (routine) shown.current = routine;
  return (
    <ConfirmDeleteDialog
      open={open && !!routine}
      onOpenChange={onOpenChange}
      title={t("deleteTitle", { title: shown.current?.title ?? "" })}
      description={t("deleteDescription")}
      confirmLabel={tCommon("moveToTrash")}
      cancelLabel={tCommon("cancel")}
      onConfirm={onConfirm}
    />
  );
}

/**
 * The deadline that the server WILL write, calculated here so as not to wait for it:
 * `null` when the routine is paused (the deadline is disarmed), the
 * next occurrence when we wake her up. It is `updateRoutine` which does
 * faith, but it does exactly this calculation, with this function.
 *
 * A cadence that `nextRunAt` refuses (time zone removed from ICU, tinkered data) does not
 * cannot be guessed: we keep the value in place and let the answer be decided.
 */
export function optimisticNextRunAt(
  routine: Routine,
  enabled: boolean,
): string | null {
  if (!enabled || routine.trigger?.type !== "schedule" && routine.trigger != null) return null;
  try {
    return nextRunAt({
      frequency: routine.frequency,
      hour: routine.hour,
      minute: routine.minute,
      weekdays: routine.weekdays,
      daysOfMonth: routine.days_of_month,
      timezone: routine.timezone,
    }, new Date()).toISOString();
  } catch {
    return routine.next_run_at;
  }
}
