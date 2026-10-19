"use client";
import { RoutineTriggerFields, RoutineTriggerSummary } from "./routine-trigger-fields";
import type { RoutineTrigger } from "@/lib/routine-triggers";


import { allowInputAutoFocus } from "@/lib/mobile-sheet-focus";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert01Icon, ArrowLeft01Icon, ArrowRight01Icon, Delete02Icon, MoreHorizontalIcon, PauseCircleIcon, Edit04Icon, PlayIcon } from "@hugeicons/core-free-icons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "@/components/app-link";
import { useFormatter, useLocale, useNow, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AssistantShell } from "@/components/assistant/assistant-shell";
import { AppContentHeader, APP_CONTENT_HEADER_LEADING_INSET } from "@/components/app-content-header";
import { EmptyScene } from "@/components/empty-scene";
import { Markdown } from "@/components/markdown";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { RoutinePromptField } from "@/components/routines/routine-prompt-field";
import { SettingsRow } from "@/components/settings/settings-ui";
import { RoutineScheduleFields } from "@/components/routines/routine-schedule-fields";
import { SpendCapCombobox } from "@/components/routines/spend-cap-combobox";
import { DEFAULT_MAX_SPEND_PERCENT } from "@/lib/routine-budget";
import {
  updateRoutineApi,
  type Routine,
} from "@/lib/routines-api";
import { useRoutineRunsQuery } from "@/lib/use-routines-query";
import { RoutineTrashDialog, useRoutineActions } from "@/components/routines/use-routine-actions";
import { useAgentModelsQuery } from "@/lib/use-agent-models-query";
import { useScrollFade } from "@/lib/use-scroll-fade";
import type { AssistantMention } from "@/lib/assistant-types";
import { useDescriptionMentions } from "@/lib/use-mention-sources";
import { useMembersQuery } from "@/lib/use-members-query";
import { useRepositorySkills } from "@/lib/use-repository-skills";
import { calendarDaysBetween } from "@/lib/due-date";
import {
  describeSchedule,
  weekdayName,
  type RoutineSchedule,
} from "@/lib/routine-schedule";
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
  /**
   * The DRAFT edition, or `null` when reading. He lives HERE and not in the
   * form because “Save” left the bottom of the form to
   * the header, where it takes the place of the switch: the button and the fields
   * are no longer in the same component, and this is the pane that holds them all
   * both.
   *
   * Its presence IS the mode: no more boolean `editing` to agree with
   * it.
   */
  const [draft, setDraft] = useState<RoutineDraft | null>(null);
  const draftSource = useRef<Routine | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  // The fade from the bottom of the list, like everywhere where content overflows.
  const listFade = useScrollFade<HTMLDivElement>();

  const editing = draft !== null && isOwner;
  const gesturePending = busy || actions.isPending(routine.id);

  // Activity reconnects effects on return; only a different routine resets local work.
  const previousRoutineId = useRef(routine.id);
  useEffect(() => {
    if (previousRoutineId.current === routine.id) return;
    previousRoutineId.current = routine.id;
    draftSource.current = null;
    setOpenRunId(null);
    setDraft(null);
  }, [routine.id]);
  // A clean edit form follows accepted remote fields; typing keeps its own draft.
  useEffect(() => {
    const source = draftSource.current;
    if (!draft || !source || source === routine || source.id !== routine.id) return;
    if (JSON.stringify(draft) === JSON.stringify(draftFrom(source))) {
      draftSource.current = routine;
      setDraft(draftFrom(routine));
    }
  }, [routine]); // eslint-disable-line react-hooks/exhaustive-deps
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
      if (isOwner) {
        draftSource.current = routine;
        setDraft(draftFrom(routine));
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

  const patch = async (fields: Parameters<typeof updateRoutineApi>[1]) => {
    setBusy(true);
    try {
      await updateRoutineApi(routine.id, fields);
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Save the draft. DAY fields only exist for their
   * cadence: sending them both would cause cadence to be refused on the server side.
   */
  const saveDraft = async () => {
    if (!draft || !draft.prompt.trim()) return;
    await patch({
      prompt: draft.prompt.trim(),
      promptMentions: draft.promptMentions,
      maxSpendPercent: draft.spendCap,
      trigger: draft.trigger,
      ...(draft.trigger.type === "schedule" ? {
      frequency: draft.schedule.frequency,
      hour: draft.schedule.hour,
      minute: draft.schedule.minute,
      weekdays:
        draft.schedule.frequency === "weekly" ? draft.schedule.weekdays : [],
      daysOfMonth:
        draft.schedule.frequency === "monthly"
          ? draft.schedule.daysOfMonth
          : [],
      } : {}),
      timezone: draft.schedule.timezone,
    });
    setDraft(null);
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

        {/* THE STATE, alongside the gesture that changes it — and a badge, not a gloss in
            end of cadence line: “this routine no longer runs” is the
            first thing to see when you arrive, not the last to read. Nothing
            when it turns: the absence of alert IS the normal state, and a
            “active” badge on each routine would no longer distinguish anything.
            Outside the owner block: a member cannot restart it, but
            il doit savoir qu'elle dort. */}
        {!routine.enabled ? (
          <Badge
            variant="secondary"
            icon={<HugeiconsIcon icon={PauseCircleIcon} />}
            // The amber product warning badges (the “Private” one
            // return): a state which is not an error, but which we do not want
            // discover by wondering why nothing happened.
            className="shrink-0 bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400"
          >
            {t("paused")}
          </Badge>
        ) : null}

        {/* DURING EDITING, “Cancel/Save” TAKES THE PLACE of
            the switch and the menu — they are not added to it.
            It's not just a question of space: a switch that writes
            immediately, next to a form waiting to be saved,
            these are two notions of “applied” on the same line. And “Throw
            now" would start the routine as it is SAVED,
            that is to say not the one we are currently writing. */}
        {!isOwner ? null : editing ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft(null)}
              disabled={busy}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              size="sm"
              onClick={() => void saveDraft()}
              disabled={busy || !draft?.prompt.trim()}
            >
              {tCommon("save")}
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            {/* The switch remains OUT: this is the state of the routine — it
                is running, or it is on pause —, not a one-off gesture that we are going to
                search in a menu. */}
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              {t("enabledLabel")}
              {/* No `disabled` during its own writing: it is
                  optimistic, there is nothing to expect. `busy` only grays it
                  for other gestures (a launch, a deletion in
                  course), where the state could change on hand. */}
              <Switch
                checked={routine.enabled}
                disabled={
                  gesturePending ||
                  agentCapabilitiesLoading ||
                  (!routine.enabled &&
                    !routineSchedulingConfigured)
                }
                onCheckedChange={toggleEnabled}
              />
            </label>
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
                <DropdownMenuItem onSelect={() => { draftSource.current = routine; setDraft(draftFrom(routine)); }}>
                  <HugeiconsIcon icon={Edit04Icon} className="size-4" />
                  {tCommon("edit")}
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

      {editing && draft ? (
        <RoutineEditor
          draft={draft}
          onChange={setDraft}
          projectId={routine.project_id}
          busy={busy}
        />
      ) : (
        <>
          {/* ── The cadence, then WHAT IT DOES ────────────────────────
              Instruction under cadence: without it, a routine was not
              than a title of three words and an hour, all crammed at the top of
              the screen — and “what she does” was precisely what we had come
              check. */}
          <div className="flex shrink-0 flex-col gap-1 px-4 pb-2">
            <RoutineTriggerSummary trigger={routine.trigger} projectId={routine.project_id} />
            {(!routine.trigger || routine.trigger.type === "schedule") ? <RoutineSummary schedule={routineSchedule(routine)} /> : <p className="text-xs text-muted-foreground">{t(routine.waiting_count ? "waitingConditions" : "listensForEvents")}</p>}

            <p className="text-xs text-muted-foreground">
              {t("executionEnvironment")}
            </p>

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

            {/* The instruction, rendered and folded (see `RoutinePrompt`). */}
            <RoutinePrompt
              projectId={routine.project_id}
              prompt={routine.prompt}
              promptMentions={routine.prompt_mentions ?? []}
            />
          </div>
        </>
      )}

      {/* The run history is a real table: date, measured work time, share of
          monthly usage, and outcome. The next occurrence stays immediately above
          it because it is a schedule, not a run with metrics. */}
      {editing ? null : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 px-4 pt-2 pb-1.5">
            <h3 className="text-xs font-medium text-muted-foreground">
              {t("runs")}
            </h3>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2 px-4 py-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-10 rounded-md" />
              ))}
            </div>
          ) : (
            <div
              ref={listFade.ref}
              {...listFade.scrollProps}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              {/* Nothing is framed when there is neither a future nor a past run. */}
              {nextRunAtIso || runs.length > 0 ? (
                <div className="border-t border-border">
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
                        <thead className="border-y border-border bg-muted/30 text-xs font-medium text-muted-foreground">
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
                  say different things — which did not happen, and which
                  qu'on peut faire tout de suite sans attendre. */}
              {runs.length === 0 ? (
                <div className="px-4 py-8">
                  <EmptyScene icon={PlayIcon} title={t("noRunsYet")} size="compact">
                    {isOwner ? (
                      <Button
                        size="sm"
                        disabled={busy}
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
        </div>
      )}

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
 * THE INSTRUCTION of the routine: rendered in markdown, folded, and unfolded.
 *
 * It IS markdown at the source — titles, lists, file paths in
 * `code` — and displaying it raw read `##` and `**` instead of
 * the structure they carry. It also commonly makes several thousand
 * signs: it is a specification, not a sentence. Hence two decisions which
 * vont ensemble :
 *
 * - **folded by default.** We open a routine to see what it has
 * product ; automatically unfolded, the instruction would push the list of
 * executions off screen, each time, for a text that we have written
 * yourself.
 * - **`line-clamp` can no longer be used.** It counts lines IN a block, and
 *    one Markdown render produces several (headings, paragraphs, lists): it
 * wouldn't cut anything anymore. It is therefore a HEIGHT which limits, and the fading of
 * `useScrollFade` which says that the text continues — on a clipping box,
 * its `edges.end` is exactly this signal, already measured, already damped.
 *
 * Unfolded, it still doesn't push anything: it parades IN its box, and the
 * list of executions remains on the screen below it.
 */
function RoutinePrompt({
  projectId,
  prompt,
  promptMentions,
}: {
  projectId: string;
  prompt: string;
  promptMentions: AssistantMention[];
}) {
  const t = useTranslations("Routines");
  const { members } = useMembersQuery(projectId, true);
  const mentionSupport = useDescriptionMentions(projectId, members);
  const repositorySkills = useRepositorySkills(
    projectId,
    "cloud",
    "routine-display",
    null,
  );
  const [expanded, setExpanded] = useState(false);
  /* A fade longer than a scroll edge (2 rem by default):
     here it does not indicate a border, it turns off a cut end of text. */
  const fade = useScrollFade<HTMLDivElement>("y", "3rem");
  /**
   * “See more” only exists if there is truly more to see: an instruction
   * of two lines does not wear a button which would reveal nothing.
   *
   * The observation FREEZES once noted. Unfolded, `edges.end` responds to another
   * question — “is there any left to scroll?” » — and falls back false as soon as we touch
   * the bottom: the back button would disappear under the finger, at the precise moment
   * where we want to fold.
   */
  const [truncated, setTruncated] = useState(false);
  useEffect(() => {
    if (!expanded && fade.edges.end) setTruncated(true);
  }, [expanded, fade.edges.end]);

  return (
    <div className="mt-1 flex flex-col items-start gap-1">
      <div
        ref={fade.ref}
        {...fade.scrollProps}
        className={cn(
          "w-full",
          // Folded: the height of the six lines that `line-clamp-6` gave.
          expanded
            ? "max-h-[40vh] overflow-y-auto"
            : "max-h-36 overflow-hidden",
        )}
      >
        <Markdown
          className="text-muted-foreground"
          mentionScan={mentionSupport.scan}
          mentionLinks={mentionSupport.links}
          resolvedMentions={promptMentions}
          skills={repositorySkills.skills}
        >
          {prompt}
        </Markdown>
      </div>
      {truncated ? (
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? t("promptShowLess") : t("promptShowMore")}
        </Button>
      ) : null}
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
 * `useNow` lives HERE rather than in the shutter: a clock that beats to the minute
 * should only re-render the line that reads it.
 *
 * A run late by a FULL day — the cron is dead — falls back on the date
 * absolute: “today” would be false, and such a delay must be seen.
 */
function NextRunRow({ at }: { at: string }) {
  const t = useTranslations("Routines");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });

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

/**
 * HOW the routine is set, in one line: its cadence, and the model that
 * executes it. The two settings that decide what costs and what is worth
 * each execution, together because they answer the same question.
 *
 * The date of the next passage is not here: it lives in the list of
 * executions, in its chronological place. The three stood on this line, and
 * “Every day at 6 p.m. · next execution August 7” read like a
 * only information when there are two — a rule, and a date which
 * suit.
 *
 * In READING it describes the recorded routine, under the header. In EDITION it
 * describes the DRAFT, under the fields that make it: it is the sentence that
 * the settings produce, and reading it just below them avoids having to
 * translate “Monday, 9, 0, Europe/Paris” at the head. A FIXED model on routine
 * does not follow the default of the account, and that is why it reads instead
 * than guessing; without an explicit model, the badge says so instead of
 * disappear — “which one is spinning?” » arises especially in this case.
 */
function RoutineSummary({
  schedule,
}: {
  schedule: RoutineSchedule;
}) {
  const t = useTranslations("Routines");
  const locale = useLocale();

  // A cadence being edited may be temporarily invalid (no day
  // checked): `describeSchedule` throws, and a summary line is not the place
  // where to say it - the fields already indicate it.
  let cadence: string | null = null;
  try {
    cadence = describeSchedule(schedule, (key, values) => t(key, values), {
      locale,
      weekdayLabel: (d) => weekdayName(d, locale),
    });
  } catch {
    cadence = null;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {cadence ? (
        <p className="text-xs text-muted-foreground">{cadence}</p>
      ) : null}
    </div>
  );
}

/** The editing draft: everything that a routine exposes to adjustment. */
interface RoutineDraft {
  trigger: RoutineTrigger;
  prompt: string;
  promptMentions: AssistantMention[];
  /** Share of the monthly budget that ONE passage can spend (1–100). */
  spendCap: number;
  schedule: RoutineSchedule;
}

/** The draft as a recorded routine gives it. */
function draftFrom(routine: Routine): RoutineDraft {
  return {
    trigger: routine.trigger ?? { type: "schedule" },
    prompt: routine.prompt,
    promptMentions: routine.prompt_mentions ?? [],
    // The routines placed before the ceiling do not already carry any in the cache
    // loaded: the fault, the very one that the base gave them.
    spendCap: routine.max_spend_percent ?? DEFAULT_MAX_SPEND_PERCENT,
    schedule: routineSchedule(routine),
  };
}

/**
 * Editing a routine: everything that decides what it does and what it costs —
 * its instruction, spending cap and cadence.
 *
 * No “name” field: the title is written by minddy from
 * the instruction, and rewrites as soon as it changes. No wizard replayed either —
 * we don't go through four screens to move an hour.
 *
 * No buttons either: “Cancel” and “Save” are in the header,
 * in place of the switch, where they remain visible whatever the
 * length of the instruction. This form only holds fields, and
 * this is the part that owns the draft.
 */
function RoutineEditor({
  draft,
  onChange,
  projectId,
  busy,
}: {
  draft: RoutineDraft;
  onChange: (draft: RoutineDraft) => void;
  /** Anchoring the branch listing: a routine clones the project repository. */
  projectId: string;
  busy: boolean;
}) {
  const t = useTranslations("Routines");

  const set = <K extends keyof RoutineDraft>(key: K, value: RoutineDraft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    /**
     * The form SCROLLS, and that's the only way to reach its bottom.
     *
     * It was `shrink-0` in a parent `overflow-hidden`: an instruction
     * long pushed everything that followed her off the screen, without any means
     * to catch up with him. `flex-1` + `min-h-0` gives it the remaining space, and
     * `overflow-y-auto` makes it searchable.
     */
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-3">
      {/* WHAT SHE DOES — top of mind, because it’s routine: the rest doesn’t
          just say with what and when. */}
      <EditorSection title={t("promptLabel")}>
        {/* The SAME field as the `job` step of the wizard — it's literally the
            same component: dictation, input ceiling and limited height. */}
        <RoutinePromptField
          autoFocus={allowInputAutoFocus()}
          projectId={projectId}
          baseBranch={null}
          value={draft.prompt}
          mentions={draft.promptMentions}
          onChange={(value, mentions) =>
            onChange({ ...draft, prompt: value, promptMentions: mentions })
          }
          disabled={busy}
        />
      </EditorSection>

      {/* Worker model and reasoning come from Account settings. This section
          only contains routine-specific execution settings. */}
      <EditorSection title={t("sectionAgent")}>
        <div className="divide-y divide-border/60">
          <p className="py-3 text-xs leading-relaxed text-muted-foreground">
            {t("workerModelHint")}
          </p>
          {/* WHAT A PASS CAN EXPEND. This is where we come to lower it
              after seeing what routine really costs — hence its place at
              side of the model, the other setting which decides the note. */}
          <SettingsRow
            label={t("spendCapLabel")}
            help={t("spendCapHelp")}
            control={
              <SpendCapCombobox
                value={draft.spendCap}
                onChange={(value) => set("spendCap", value)}
                disabled={busy}
              />
            }
          />
        </div>
      </EditorSection>

      {/* WHEN it starts. */}
      <EditorSection title={t("triggerLabel")}>
        <RoutineTriggerFields projectId={projectId} value={draft.trigger} onChange={value => set("trigger", value)} />
        {draft.trigger.type === "schedule" ? <>
        <RoutineScheduleFields
          value={draft.schedule}
          onChange={(value) => set("schedule", value)}
        />
        {/* What all the fields above give, in plain English. Under them, and not
            at the bottom of the screen: it is their result which is read again before
            d'enregistrer. */}
        <RoutineSummary schedule={draft.schedule} />
        </> : null}
      </EditorSection>
    </div>
  );
}

/**
 * A section of the form: a title, and what it covers.
 *
 * The title takes up that of the “Executions” of the reading mode (`text-xs`,
 * `font-medium`, attenuated) — it is already the “section” level of this pane, and in
 * inventing a second one would have given two hierarchies in the same panel.
 */
function EditorSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}
