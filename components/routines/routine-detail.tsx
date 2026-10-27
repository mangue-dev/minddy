"use client";


import { HugeiconsIcon } from "@hugeicons/react";
import { Alert01Icon, ArrowLeft01Icon, ArrowRight01Icon, Delete02Icon, MoreHorizontalIcon, PlayIcon } from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "@/components/app-link";
import { useFormatter, useTranslations } from "next-intl";
import { useLiveNow } from "@/lib/use-live-now";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { AssistantShell } from "@/components/assistant/assistant-shell";
import { AppContentHeader, APP_CONTENT_HEADER_LEADING_INSET } from "@/components/app-content-header";
import { EmptyScene } from "@/components/empty-scene";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { RoutineInstruction, RoutineSettings, RoutineStateControl } from "@/components/routines/routine-detail-sections";
import {
  updateRoutineApi,
  type Routine,
} from "@/lib/routines-api";
import { useRoutineRunsQuery } from "@/lib/use-routines-query";
import { RoutineTrashDialog, useRoutineActions } from "@/components/routines/use-routine-actions";
import { useAgentModelsQuery } from "@/lib/use-agent-models-query";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { calendarDaysBetween } from "@/lib/due-date";
import type { RoutineSchedule } from "@/lib/routine-schedule";
import type { RoutineRunSummary } from "@/lib/routines-api";
import type { MessageKey } from "@/lib/i18n-keys";
import { formatRoutineRunDuration } from "@/lib/routine-run-metrics";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * A ROUTINE (MIN-185) and its “Previous Executions”.
 *
 * This is THE only place where his runs can be read: they come off the list of
 * conversations, otherwise a daily routine would take up all the space.
 *
 * **Two levels, not one.** The routine shows the LIST of its passages — one
 * full width line per pass, its date and its outcome. Opening a line opens the
 * REAL Numo conversation of this occurrence, with its composer to respond. A
 * routine run is not a degraded mode — it continues like any conversation,
 * simply from the Routines tab.
 *
 * The header follows what we are looking at: the title of the routine and its settings on
 * the list, the DATE of the passage and a return to the conversation. The rest of the
 * routine gestures (the switch, the menu) there is nothing to do: we do not adjust
 * not a cadence when reading what a passage produced.
 *
 * **The header follows that of the other detail panes** (conversation, pull
 * request, return): the title alone on its line, no border under it — the
 * content breathes all the way to the top — and gestures grouped into a “…” menu
 * rather than aligned in buttons. What really sets them apart is the switch
 * active/paused, stays out: this is a state, not a one-time action.
 *
 * The CADENCE comes out of the header and lives with the executions, where it responds to
 * the question we ask ourselves when reading the list of passages.
 *
 * **`last_error` READS.** A passage skipped due to lack of budget is said here, with the
 * link to invoicing — not just in a column in the database. A
 * passage which, for its part, LEFT and stopped on its spending limit says so
 * in his conversation, at the end of his thread: it's interrupted work, not
 * a missed appointment, and he has things to show.
 */
/** What the sidebar menu can ask a routine pane to open. */
export type RoutineDetailIntent = "edit" | "latest-run";

export function RoutineDetail({
  routine,
  project,
  isOwner,
  onChanged,
  onDeleted,
  intent,
  onIntentConsumed,
}: {
  routine: Routine;
  /** The supporting project — its orb opens the header, like a conversation:
   * “what deposit are we talking about? » is the question we ask ourselves when we arrive. */
  project: {
    id: string;
    icon_url: string | null;
    orb_seed: string | null;
  } | null;
  /** Gestures (switch, throw, edit, delete) are up to the owner
   * alone — a button that leads to a 403 is not displayed. */
  isOwner: boolean;
  onChanged: () => void;
  onDeleted: () => void;
  /**
   * A one-shot request from the sidebar menu (MIN-685): open the editor, or
   * the most recent run. Handled once, then reported through
   * `onIntentConsumed` so a later render never replays it.
   */
  intent?: RoutineDetailIntent | null;
  onIntentConsumed?: () => void;
}) {
  const t = useTranslations("Routines");
  const tCommon = useTranslations("Common");
  const format = useFormatter();
  const {
    routineSchedulingConfigured,
    loading: agentCapabilitiesLoading,
  } = useAgentModelsQuery();
  const actions = useRoutineActions({ schedulingConfigured: routineSchedulingConfigured });

  const { runs, loading } = useRoutineRunsQuery(routine.id);
  /**
   * The OPEN passage, or `null` — it is he, and he alone, who decides what
   * this pane shows: the list of passages, or the conversation of one of them.
   * Nothing is open by default: arriving at a routine means wanting to see
   * what she is and what she has done, not reread a particular thread.
   */
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // The fade from the bottom of the list, like everywhere where content overflows.
  const listFade = useScrollFade<HTMLDivElement>();

  // The instruction, which the sidebar's "Edit" brings into view and focuses.
  const instructionRef = useRef<HTMLDivElement>(null);
  const gesturePending = actions.isPending(routine.id);

  // Activity reconnects effects on return; only a different routine resets local work.
  const previousRoutineId = useRef(routine.id);
  useEffect(() => {
    if (previousRoutineId.current === routine.id) return;
    previousRoutineId.current = routine.id;
    setOpenRunId(null);
  }, [routine.id]);
  const openRun: RoutineRunSummary | null =
    runs.find((r) => r.id === openRunId) ?? null;
  const openRoutineRun = (run: RoutineRunSummary) => {
    setOpenRunId(run.id);
  };

  // Consume the sidebar's intent once its data is there: the editor needs
  // only the routine; the latest run waits for the run list, and an empty
  // or refused list simply leaves the run list on screen.
  useEffect(() => {
    if (!intent) return;
    if (intent === "edit") {
      // The instruction is written in place: "Edit" brings it into view.
      if (isOwner) {
        instructionRef.current?.scrollIntoView({ block: "nearest" });
        instructionRef.current?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus();
      }
      onIntentConsumed?.();
      return;
    }
    if (loading) return;
    const latest = runs[0];
    if (latest) setOpenRunId(latest.id);
    onIntentConsumed?.();
  }, [intent, loading, runs, isOwner]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * The next passage reads in the LIST of executions, at the head — it is
   * a date from the same series as those below, just not yet
   * arrival. A paused routine does not have one: its deadline is disarmed
   * (`next_run_at` null), and announcing one would be a lie on screen.
   */
  const nextRunAtIso = routine.enabled ? routine.next_run_at : null;
  const schedule = useMemo(() => routineSchedule(routine), [routine]);

  // Saved in place, section by section: nothing is grayed while it writes.
  const save = async (fields: Parameters<typeof updateRoutineApi>[1]) => {
    try {
      await updateRoutineApi(routine.id, fields);
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const runNow = () => actions.runNow(routine);
  const toggleEnabled = (enabled: boolean) => actions.toggleEnabled(routine, enabled);
  const remove = async () => {
    if (await actions.remove(routine)) onDeleted();
  };

  /**
   * AN OPEN PASSAGE: The real conversation of this run — the same component as
   * the Conversations tab serves, with its thread, its diff, its pull request and its
   * compose. We can therefore RESPOND to a routine passage: it picks up where
   * it stopped, like any session.
   *
   * The header only carries what is valid here: the return to the list of
   * passages, and the DATE of it in place of the title. Neither switch nor
   * menu — you don't set a cadence by reading what a passage produced.
   *
   */
  if (openRun?.numo_conversation_id) {
    const headerTitle = (
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("backToRuns")}
          onClick={() => setOpenRunId(null)}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} />
        </Button>
        {project ? (
          <ProjectOrb
            seed={projectOrbSeed(project)}
            iconUrl={project.icon_url}
            className="size-4 shrink-0"
          />
        ) : null}
        <span className="truncate text-sm font-medium">
          {format.dateTime(new Date(openRun.created_at), {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </span>
      </div>
    );

    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <AppContentHeader contentClassName="gap-2">
          {headerTitle}
        </AppContentHeader>
        <div className="min-h-0 flex-1">
          <AssistantShell
            projectId={routine.project_id}
            compact
            embeddedConversationId={openRun.numo_conversation_id}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* The title and controls share the same 60 px bar as every detail pane. */}
      <AppContentHeader contentClassName="gap-2">
        {project ? (
          <ProjectOrb
            seed={projectOrbSeed(project)}
            iconUrl={project.icon_url}
            className={`size-4 shrink-0 ${APP_CONTENT_HEADER_LEADING_INSET}`}
          />
        ) : null}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {routine.title}
        </span>

        {/* THE STATE and the gesture that changes it are one control: a badge
            that opens Active / Paused, like a pull request's state. A reader
            only sees it when the routine sleeps. No `disabled` during its own
            writing: it is optimistic. */}
        <RoutineStateControl
          enabled={routine.enabled}
          canChange={isOwner}
          disabled={gesturePending || agentCapabilitiesLoading}
          canResume={routineSchedulingConfigured}
          onChange={toggleEnabled}
        />

        {!isOwner ? null : (
          <div className="flex shrink-0 items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("actionsLabel")}
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={gesturePending}
                  onSelect={() => void runNow()}
                >
                  <HugeiconsIcon icon={PlayIcon} className="size-4" />
                  {t("runNow")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setConfirmingDelete(true)}
                >
                  <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                  {tCommon("moveToTrash")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </AppContentHeader>

      {/* One column, as wide as an objective's page: what the routine does,
          its settings, then what it has done. The whole page scrolls. */}
      <div
        ref={listFade.ref}
        {...listFade.scrollProps}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-6 app-desktop:px-6"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <div className="flex flex-col gap-1 empty:hidden">
            {!agentCapabilitiesLoading &&
            !routineSchedulingConfigured ? (
              <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <HugeiconsIcon icon={Alert01Icon} className="size-3.5 shrink-0" />
                <span>
                  {t("unavailableScheduler")}
                </span>
              </p>
            ) : null}

            {routine.legacy_source_key ? <p className="rounded-md border p-3 text-sm">{t("legacyProposalNotice")}</p> : null}
            {routine.trigger_error ? <p role="alert" className="text-sm text-destructive">{["quota", "launchFailed"].includes(routine.trigger_error) ? routineErrorLabel(routine.trigger_error, t) : t("triggerFilterError")}</p> : null}
            {routine.last_error ? (
              <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <HugeiconsIcon icon={Alert01Icon} className="size-3.5 shrink-0" />
                <span>{routineErrorLabel(routine.last_error, t)}</span>
                {routine.last_error === "quota" ? (
                  <Link
                    href="/settings/billing"
                    className="underline underline-offset-2"
                  >
                    {t("seeBilling")}
                  </Link>
                ) : null}
              </p>
            ) : null}

          </div>

          <div ref={instructionRef}>
            <RoutineInstruction key={routine.id} routine={routine} isOwner={isOwner} onSave={save} />
          </div>

          <RoutineSettings
            key={routine.id}
            routine={routine}
            isOwner={isOwner}
            schedule={schedule}
            onSave={save}
          />

      {/* The run history is a real table: date, measured work time, share of
          monthly usage, and outcome. The next occurrence stays immediately above
          it because it is a schedule, not a run with metrics. */}
          <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            {t("runs")}
          </h3>

          {loading ? (
            <div className="flex flex-col gap-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-10 rounded-md" />
              ))}
            </div>
          ) : (
            <div>
              {/* Nothing is framed when there is neither a future nor a past run. */}
              {nextRunAtIso || runs.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-border">
                  {nextRunAtIso ? <NextRunRow at={nextRunAtIso} /> : null}
                  {runs.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[36rem] table-fixed text-left">
                        <colgroup>
                          <col className="w-[36%]" />
                          <col className="w-[18%]" />
                          <col className="w-[16%]" />
                          <col className="w-[30%]" />
                        </colgroup>
                        <thead className="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
                          <tr>
                            <th scope="col" className="px-4 py-2 font-medium">
                              {t("runDate")}
                            </th>
                            <th scope="col" className="px-3 py-2 font-medium">
                              {t("runDuration")}
                            </th>
                            <th scope="col" className="px-3 py-2 font-medium">
                              {t("runUsage")}
                            </th>
                            <th scope="col" className="px-3 py-2 font-medium">
                              {t("runResult")}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {runs.map((run) => {
                            const date = format.dateTime(
                              new Date(run.created_at),
                              {
                                dateStyle: "medium",
                                timeStyle: "short",
                              },
                            );
                            return (
                              <tr
                                key={run.id}
                                onClick={() => openRoutineRun(run)}
                                className="group transition-colors hover:bg-muted/50 focus-within:bg-muted/50"
                              >
                                <td className="px-4 py-2.5 text-sm">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openRoutineRun(run);
                                    }}
                                    aria-label={t("openRun", { date })}
                                    className="block w-full rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    <span className="block truncate">{date}</span>
                                    {run.origin ? (
                                      <span className="block text-[11px] text-muted-foreground">
                                        {t(
                                          run.origin === "scheduled"
                                            ? "runOriginScheduled"
                                            : run.origin === "manual" ? "runOriginManual" : run.origin === "database" ? "trigger_database" : "eventRun",
                                        )}
                                      </span>
                                    ) : null}
                                    {run.subject_id && run.subject_type ? <span className="block truncate text-[11px] text-muted-foreground">{t(`source_${run.subject_type}`)} · {run.subject_id}</span> : null}
                                  </button>
                                </td>
                                <td className="pointer-events-none relative px-3 py-2.5 text-xs tabular-nums text-muted-foreground">
                                  {formatRoutineRunDuration(
                                    run.started_at,
                                    run.completed_at,
                                  )}
                                </td>
                                <td className="pointer-events-none relative px-3 py-2.5 text-xs tabular-nums text-muted-foreground">
                                  {formatRunUsagePercent(
                                    run.usage_percent,
                                    format,
                                  )}
                                </td>
                                <td className="relative px-3 py-2.5">
                                  <div className="flex min-w-0 items-center justify-between gap-2">
                                    <span className="pointer-events-none relative min-w-0 truncate text-xs text-muted-foreground">
                                      {run.awaiting_input
                                        ? t("runWaitingInput")
                                        : run.error_message
                                          ? run.error_message
                                          : run.outcome
                                            ? run.outcome
                                            : t(runStatusKey(run.status))}
                                    </span>
                                    <HugeiconsIcon icon={ArrowRight01Icon} className="pointer-events-none relative size-4 shrink-0 text-muted-foreground" />
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* The gesture IS where the void is seen: “she has not yet
                  turned" calls for "then spin it", not a detour through
                  the menu. Reserved for the owner, like the rest. He's staying
                  under the line of the next passage when it is there: both
                  say different things — what has not happened yet, and what
                  can be done right away without waiting. */}
              {runs.length === 0 ? (
                <div className="px-4 py-8">
                  <EmptyScene icon={PlayIcon} title={t("noRunsYet")} size="compact">
                    {isOwner ? (
                      <Button
                        size="sm"
                        disabled={gesturePending}
                        onClick={() => void runNow()}
                      >
                        <HugeiconsIcon icon={PlayIcon} className="size-4" />
                        {t("runNow")}
                      </Button>
                    ) : null}
                  </EmptyScene>
                </div>
              ) : null}
            </div>
          )}
          </section>
        </div>
      </div>

      <RoutineTrashDialog
        routine={routine}
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        onConfirm={() => void remove()}
      />
    </div>
  );
}

/**
 * The COMING passage, at the top of the list of executions. Everything is in
 * `text-muted-foreground`: this is what distinguishes it from a passage which had
 * place, without giving it a separate icon or badge. No gestures — the line is not
 * not clickable, there is nothing to read yet.
 *
 * **It is said in RELATIVE** — “today at 09:00”, “in 3 days at 11:00”.
 * This is the question we ask ourselves when reading it: not *when* in absolute terms,
 * but *how soon*. The exact date has not disappeared, it has passed
 * behind, on hover, in the tooltip.
 *
 * The tooltip trigger is the TEXT — not the line. Hence the absence
 * of `flex-1` on the `span`: stretched, it would make the entire width a zone of
 * hover, and the tooltip would come out missing what it explains.
 *
 * The difference is counted in CALENDAR days and not in duration: at 10 p.m., a passage
 * tomorrow at 9 a.m. is “tomorrow,” not “in 11 hours.” What changes from one
 * transition to the other, it's the name of the day, not a number of hours.
 *
 * `useLiveNow` lives HERE rather than in the shutter: a clock that beats to the minute
 * should only re-render the line that reads it.
 *
 * A run late by a FULL day — the cron is dead — falls back on the date
 * absolute: “today” would be false, and such a delay must be seen.
 */
function NextRunRow({ at }: { at: string }) {
  const t = useTranslations("Routines");
  const format = useFormatter();
  const now = useLiveNow();

  const date = new Date(at);
  const exact = format.dateTime(date, {
    dateStyle: "full",
    timeStyle: "short",
  });
  const time = format.dateTime(date, { hour: "2-digit", minute: "2-digit" });
  const days = calendarDaysBetween(now, date);

  const label =
    days < 0
      ? t("nextRunAt", {
          date: format.dateTime(date, {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        })
      : days === 0
        ? t("nextRunToday", { time })
        : days === 1
          ? t("nextRunTomorrow", { time })
          : t("nextRunInDays", { days, time });

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="min-w-0 truncate">{label}</span>
        </TooltipTrigger>
        <TooltipContent>{exact}</TooltipContent>
      </Tooltip>
    </div>
  );
}

/** Formats a server-derived share while keeping BYOK/unavailable values distinct. */
function formatRunUsagePercent(
  percent: number | null | undefined,
  format: ReturnType<typeof useFormatter>,
): string {
  if (percent == null || !Number.isFinite(percent) || percent < 0) return "—";
  if (percent > 0 && percent < 0.1) {
    return `<${format.number(0.001, {
      style: "percent",
      maximumFractionDigits: 1,
    })}`;
  }
  return format.number(percent / 100, {
    style: "percent",
    maximumFractionDigits: percent < 1 ? 1 : 0,
  });
}

/** The status of an occurrence in one word, when it has no outcome to show. */
function runStatusKey(
  status: RoutineRunSummary["status"],
): MessageKey<"Routines"> {
  if (status === "queued" || status === "running") return "runStatusWorking";
  if (status === "failed") return "runStatusFailed";
  if (status === "canceled") return "runStatusCanceled";
  return "runStatusIdle";
}

/** The cadence of a routine, such as calculation and sentence awaits it. */
export function routineSchedule(routine: Routine): RoutineSchedule {
  return {
    frequency: routine.frequency,
    hour: routine.hour,
    minute: routine.minute,
    weekdays: routine.weekdays,
    daysOfMonth: routine.days_of_month,
    timezone: routine.timezone,
  };
}

/** The reason for a missed passage, in one sentence. The CODE comes from the server. */
function routineErrorLabel(
  code: string,
  t: (key: "lastError_quota", values?: Record<string, string>) => string,
): string {
  switch (code) {
    case "quota":
      return t("lastError_quota");
    case "managedServiceUnavailable":
      return t("lastError_managedServiceUnavailable" as "lastError_quota");
    // Codes of the retired code agent (MIN-721) still stored on a routine read
    // as a launch failure until its next occurrence clears them.
    default:
      return t("lastError_launchFailed" as "lastError_quota");
  }
}
