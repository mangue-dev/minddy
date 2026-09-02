"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useFormatter, useLocale, useNow, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  ConfirmDeleteDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
  Switch,
  cn,
  toast,
} from "mangue-ui";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  GitPullRequest,
  MoreHorizontal,
  PauseCircle,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";

import { AgentConversation } from "@/components/agent/agent-conversation";
import { AppContentHeader } from "@/components/app-content-header";
import { EmptyScene } from "@/components/empty-scene";
import { Markdown } from "@/components/markdown";
import { ModelBadge } from "@/components/model-badge";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import {
  PR_STATE_STYLES,
  PrStateBadge,
} from "@/components/pull-requests/pr-state-badge";
import { agentSessionStatusKey } from "@/components/agents/agent-session-status";
import { BranchCombobox } from "@/components/agent/branch-combobox";
import { ModelCombobox } from "@/components/agent/model-combobox";
import { ReasoningCombobox } from "@/components/agent/reasoning-combobox";
import { RoutinePromptField } from "@/components/routines/routine-prompt-field";
import { SettingsRow } from "@/components/settings/settings-ui";
import { RoutineScheduleFields } from "@/components/routines/routine-schedule-fields";
import { SpendCapCombobox } from "@/components/routines/spend-cap-combobox";
import { DEFAULT_MAX_SPEND_PERCENT } from "@/lib/routine-budget";
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
  useRoutineRunsQuery,
} from "@/lib/use-routines-query";
import { useAgentModelsQuery, useReasoningLevelsFor } from "@/lib/use-agent-models-query";
import { useAgentPreferencesQuery } from "@/lib/use-agent-preferences-query";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { nearestReasoningLevel, type ReasoningLevel } from "@/lib/agent-reasoning";
import { calendarDaysBetween } from "@/lib/due-date";
import {
  describeSchedule,
  nextRunAt,
  weekdayName,
  type RoutineSchedule,
} from "@/lib/routine-schedule";
import type { AgentRunSummary } from "@/lib/agent-api";
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
 * full width line per pass, its date and the status of its pull request. Open
 * a line opens the REAL conversation of this run (`AgentConversation`, this one
 * same as the Conversations tab serves): the thread, the diff, the pull request, and
 * dial him to respond. A routine run is not a degraded mode —
 * it continues like any session, simply from the tab
 * Routines.
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
export function RoutineDetail({
  routine,
  project,
  isOwner,
  onBack,
  onChanged,
  onDeleted,
}: {
  routine: Routine;
  /** The supporting project — its orb opens the header, like a conversation:
   * “what deposit are we talking about? » is the question we ask ourselves when we arrive. */
  project: { id: string; icon_url: string | null; orb_seed: string | null } | null;
  /** Gestures (switch, throw, edit, delete) are up to the owner
   * alone — a button that leads to a 403 is not displayed. */
  isOwner: boolean;
  onBack: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("Routines");
  const tAgents = useTranslations("Agents");
  const tCommon = useTranslations("Common");
  const format = useFormatter();
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    cloudExecutionConfigured,
    routineSchedulingConfigured,
    loading: agentCapabilitiesLoading,
  } = useAgentModelsQuery();

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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  // The fade from the bottom of the list, like everywhere where content overflows.
  const listFade = useScrollFade<HTMLDivElement>();

  const editing = draft !== null && isOwner;

  // Changing routine closes what we read about the previous one.
  useEffect(() => {
    setOpenRunId(null);
    setDraft(null);
  }, [routine.id]);
  const openRun: AgentRunSummary | null =
    runs.find((r) => r.id === openRunId) ?? null;

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
      model: draft.model || null,
      reasoningLevel: draft.reasoning,
      baseBranch: draft.baseBranch || null,
      maxSpendPercent: draft.spendCap,
      frequency: draft.schedule.frequency,
      hour: draft.schedule.hour,
      minute: draft.schedule.minute,
      weekdays: draft.schedule.frequency === "weekly" ? draft.schedule.weekdays : [],
      daysOfMonth:
        draft.schedule.frequency === "monthly" ? draft.schedule.daysOfMonth : [],
      timezone: draft.schedule.timezone,
    });
    setDraft(null);
  };

  const runNow = async () => {
    if (!cloudExecutionConfigured) {
      toast.error(t("unavailableExecutionBackend"));
      return;
    }
    setBusy(true);
    try {
      await runRoutineNowApi(routine.id);
      // The passage has just been born: the list of executions does not know it
      // again, and it only pollutes from the moment it has one.
      await queryClient.invalidateQueries({
        queryKey: routineRunsQueryKey(routine.id),
      });
      toast.success(t("runStarted"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /**
   * L'interrupteur bascule TOUT DE SUITE.
   *
   * It's a STATE, and a state is reversed with a finger: wait for the writing then
   * reloading the list left two seconds of switch frozen on
   * the old position, during which the gesture seemed to have served no purpose
   * Nothing. So we write to the cache first — the column and this pane read the
   * same input, everything moves in the same rendering - we then send, and we
   * RESETS the snapshot from before if the server refuses (403 from a member, cadence
   * become illegible), with its message.
   *
   * `next_run_at` follows in the same movement: deactivating it disarms
   * the deadline, reactivating it recalculates it — with the SAME function as the
   * server, otherwise the “next execution” line would display a date for
   * show another one a second later.
   */
  const toggleSeq = useRef(0);
  const toggleEnabled = (enabled: boolean) => {
    if (enabled && (!cloudExecutionConfigured || !routineSchedulingConfigured)) {
      toast.error(
        t(
          !cloudExecutionConfigured
            ? "unavailableExecutionBackend"
            : "unavailableScheduler",
        ),
      );
      return;
    }
    const seq = ++toggleSeq.current;
    const previous = patchRoutineInCache(queryClient, routine.id, {
      enabled,
      next_run_at: optimisticNextRunAt(routine, enabled),
    });
    void updateRoutineApi(routine.id, { enabled })
      .then(({ routine: saved }) => {
        // A more recent switch has left in the meantime: its answer is authentic,
        // not this one — two quick clicks shouldn't end up upside down.
        if (seq === toggleSeq.current) patchRoutineInCache(queryClient, saved.id, saved);
      })
      .catch((err) => {
        if (seq !== toggleSeq.current) return;
        if (previous) queryClient.setQueryData(routinesQueryKey(), previous);
        toast.error((err as Error).message);
      });
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteRoutineApi(routine.id);
      onDeleted();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
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
   * On the right, the conversation itself poses the DIFF; the pull request, she,
   * comes from the host (`headerActions`), exactly like on the Agents page:
   * `AgentConversation` can only offer to CREATE one, never to open
   * the one that exists — it is up to the part that receives it to know where it is read.
   */
  if (openRun) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <AgentConversation
          key={openRun.id}
          noteRunId={openRun.id}
          projectId={project?.id ?? null}
          active
          headerTitle={
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("backToRuns")}
                onClick={() => setOpenRunId(null)}
              >
                <ChevronLeft />
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
          }
          headerActions={<PrHeaderAction run={openRun} />}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* The title and controls share the same 60 px bar as every detail pane. */}
      <AppContentHeader contentClassName="gap-2 px-4">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={tAgents("backToList")}
          className="md:hidden"
          onClick={onBack}
        >
          <ChevronLeft />
        </Button>
        {project ? (
          <ProjectOrb
            seed={projectOrbSeed(project)}
            iconUrl={project.icon_url}
            className="size-4 shrink-0"
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
            icon={<PauseCircle />}
            // The amber product warning badges (the “Private” one
            // return): a state which is not an error, but which we do not want
            // discover by wondering why nothing happened.
            className="shrink-0 border-amber-700/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-400"
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
                  busy ||
                  agentCapabilitiesLoading ||
                  (!routine.enabled &&
                    (!cloudExecutionConfigured || !routineSchedulingConfigured))
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
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={
                    busy || agentCapabilitiesLoading || !cloudExecutionConfigured
                  }
                  onSelect={() => void runNow()}
                >
                  <Play className="size-4" />
                  {t("runNow")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDraft(draftFrom(routine))}>
                  <Pencil className="size-4" />
                  {tCommon("edit")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setConfirmingDelete(true)}
                >
                  <Trash2 className="size-4" />
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
            <RoutineSummary
              schedule={routineSchedule(routine)}
              model={routine.model}
            />

            <p className="text-xs text-muted-foreground">
              {t("executionEnvironment")}
            </p>

            {!agentCapabilitiesLoading &&
            (!cloudExecutionConfigured || !routineSchedulingConfigured) ? (
              <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-3.5 shrink-0" />
                <span>
                  {t(
                    !cloudExecutionConfigured
                      ? "unavailableExecutionBackend"
                      : "unavailableScheduler",
                  )}
                </span>
              </p>
            ) : null}

            {routine.last_error ? (
              <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-3.5 shrink-0" />
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
            <RoutinePrompt prompt={routine.prompt} />
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
                            const date = format.dateTime(new Date(run.created_at), {
                              dateStyle: "medium",
                              timeStyle: "short",
                            });
                            return (
                              <tr
                                key={run.id}
                                onClick={() => setOpenRunId(run.id)}
                                className="group cursor-pointer transition-colors hover:bg-muted/50 focus-within:bg-muted/50"
                              >
                                <td className="px-4 py-2.5 text-sm">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setOpenRunId(run.id);
                                    }}
                                    aria-label={t("openRun", { date })}
                                    className="block w-full truncate rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    {date}
                                  </button>
                                </td>
                                <td className="pointer-events-none relative px-3 py-2.5 text-xs tabular-nums text-muted-foreground">
                                  {formatRoutineRunDuration(
                                    run.started_at,
                                    run.completed_at,
                                  )}
                                </td>
                                <td className="pointer-events-none relative px-3 py-2.5 text-xs tabular-nums text-muted-foreground">
                                  {formatRunUsagePercent(run.usage_percent, format)}
                                </td>
                                <td className="relative px-3 py-2.5">
                                  <div className="flex min-w-0 items-center justify-between gap-2">
                                    {/* A pull request is its own destination; otherwise
                                        the status describes the run opened by the row. */}
                                    {run.pr_state ? (
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          router.push(`/pull-requests?run=${run.id}`)
                                        }}
                                        className="relative z-10 shrink-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      >
                                        <PrStateBadge state={run.pr_state} icon />
                                      </button>
                                    ) : (
                                      <span className="pointer-events-none relative min-w-0 truncate text-xs text-muted-foreground">
                                        {tAgents(
                                          agentSessionStatusKey({
                                            status: run.status,
                                            prNumber: run.pr_number,
                                            prState: run.pr_state,
                                          }),
                                        )}
                                      </span>
                                    )}
                                    <ChevronRight className="pointer-events-none relative size-4 shrink-0 text-muted-foreground" />
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
                  <EmptyScene icon={Play} title={t("noRunsYet")} size="compact">
                    {isOwner ? (
                      <Button
                        size="sm"
                        disabled={
                          busy || agentCapabilitiesLoading || !cloudExecutionConfigured
                        }
                        onClick={() => void runNow()}
                      >
                        <Play className="size-4" />
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

      <ConfirmDeleteDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={t("deleteTitle", { title: routine.title })}
        description={t("deleteDescription")}
        confirmLabel={tCommon("moveToTrash")}
        cancelLabel={tCommon("cancel")}
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
function RoutinePrompt({ prompt }: { prompt: string }) {
  const t = useTranslations("Routines");
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
          expanded ? "max-h-[40vh] overflow-y-auto" : "max-h-36 overflow-hidden",
        )}
      >
        <Markdown className="text-muted-foreground">{prompt}</Markdown>
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
  const exact = format.dateTime(date, { dateStyle: "full", timeStyle: "short" });
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

/**
 * What the header of a passage shows about its pull request — same rule as on
 * the Agents page: a LIVING PR is an action (“Open pull request”),
 * a FINISHED PR is a state (the badge, clickable - the PR can still be consulted).
 * No PR: nothing, and the conversation then suggests creating one.
 */
function PrHeaderAction({ run }: { run: AgentRunSummary }) {
  const t = useTranslations("Agents");
  const router = useRouter();
  if (run.pr_number == null) return null;
  const closed =
    run.pr_state === "merged" || run.pr_state === "closed"
      ? run.pr_state
      : null;
  const open = () => router.push(`/pull-requests?run=${run.id}`);
  return closed ? (
    <button
      type="button"
      onClick={open}
      className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <PrStateBadge state={closed} icon />
    </button>
  ) : (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={open}
      className={cn(run.pr_state === "open" && PR_STATE_STYLES.open)}
    >
      <GitPullRequest className="size-3.5" />
      {t("openPullRequest")}
    </Button>
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
function optimisticNextRunAt(routine: Routine, enabled: boolean): string | null {
  if (!enabled) return null;
  try {
    return nextRunAt(routineSchedule(routine), new Date()).toISOString();
  } catch {
    return routine.next_run_at;
  }
}

/** The cadence of a routine, such as calculation and sentence awaits it. */
function routineSchedule(routine: Routine): RoutineSchedule {
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
    case "noRepo":
      return t("lastError_noRepo" as "lastError_quota");
    case "alreadyRunning":
      return t("lastError_alreadyRunning" as "lastError_quota");
    case "modelAbovePlan":
      return t("lastError_modelAbovePlan" as "lastError_quota");
    case "managedServiceUnavailable":
      return t("lastError_managedServiceUnavailable" as "lastError_quota");
    case "executionBackendUnavailable":
      return t("lastError_executionBackendUnavailable" as "lastError_quota");
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
  model,
}: {
  schedule: RoutineSchedule;
  model: string | null;
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
      {cadence ? <p className="text-xs text-muted-foreground">{cadence}</p> : null}
      <ModelBadge
        model={model}
        size={12}
        fallbackLabel={t("modelDefaultBadge")}
        tooltip={t("modelTooltip")}
      />
    </div>
  );
}

/** The editing draft: everything that a routine exposes to adjustment. */
interface RoutineDraft {
  prompt: string;
  /** "" = the default model of the account (no model fixed on the routine). */
  model: string;
  reasoning: ReasoningLevel;
  /** "" = the default branch of the repository. */
  baseBranch: string;
  /** Share of the monthly budget that ONE passage can spend (1–100). */
  spendCap: number;
  schedule: RoutineSchedule;
}

/** The draft as a recorded routine gives it. */
function draftFrom(routine: Routine): RoutineDraft {
  return {
    prompt: routine.prompt,
    model: routine.model ?? "",
    reasoning: routine.reasoning_level,
    baseBranch: routine.base_branch ?? "",
    // The routines placed before the ceiling do not already carry any in the cache
    // loaded: the fault, the very one that the base gave them.
    spendCap: routine.max_spend_percent ?? DEFAULT_MAX_SPEND_PERCENT,
    schedule: routineSchedule(routine),
  };
}

/**
 * Editing a routine: everything that decides what it does, and what
 * it costs — its education, its model, its level of reasoning, its
 * starting branch and its cadence.
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
  const tAgent = useTranslations("Agent");
  const tCommon = useTranslations("Common");
  // The default of the ACCOUNT, then that of the instance: what the routine will execute
  // if we don't set any model for it. The combobox displays it as the “default” option.
  const { defaultModel: providerDefaultModel } = useAgentModelsQuery();
  const { defaultModel } = useAgentPreferencesQuery();
  // The levels of the model that this routine rotates (see composing it).
  const reasoningLevels = useReasoningLevelsFor(
    draft.model || defaultModel || providerDefaultModel,
  );

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
          autoFocus
          value={draft.prompt}
          onChange={(value) => set("prompt", value)}
          disabled={busy}
        />
      </EditorSection>

      {/* WHAT she works with: the model, what she is left to think about, and
          the code from which it starts. The three were frozen at creation without
          no surface to change one's mind — it was necessary to remove the routine and
          redo it.

          In ROWS (labeled on the left, control on the right) and not stacked: three
          controls in a row without line label did not say which one
          set what, and the full-width model selector overwrote the
          two more when it is not more important. The three carry
          now the same compact pellet. */}
      <EditorSection title={t("sectionAgent")}>
        <div className="divide-y divide-border/60">
          <SettingsRow
            label={t("modelLabel")}
            control={
              <ModelCombobox
                variant="compact"
                value={draft.model}
                onChange={(value) => set("model", value)}
                defaultLabel={t("modelDefault")}
                defaultModelId={defaultModel || providerDefaultModel}
                placeholder={t("modelPlaceholder")}
                emptyLabel={t("modelEmpty")}
                loadingLabel={tCommon("loading")}
                freeTextLabel={(query) => t("modelFreeText", { model: query })}
              />
            }
          />
          <SettingsRow
            label={t("reasoningLabel")}
            control={
              <ReasoningCombobox
                value={nearestReasoningLevel(draft.reasoning, reasoningLevels)}
                onChange={(value) => set("reasoning", value)}
                levels={reasoningLevels}
              />
            }
          />
          {/* The START branch: the one that each execution clones and from
              which she opens her pull request. Anchored to the project, like the
              consists of a notebook session — a routine does not have a ticket. */}
          <SettingsRow
            label={t("baseBranchLabel")}
            control={
              <BranchCombobox
                projectId={projectId}
                value={draft.baseBranch}
                onChange={(value) => set("baseBranch", value)}
                defaultLabel={tAgent("branchDefault")}
                defaultHint={tAgent("branchDefaultHint")}
                placeholder={tAgent("branchSearchPlaceholder")}
                emptyLabel={tAgent("branchSearchEmpty")}
                loadingLabel={tAgent("branchSearchLoading")}
                disabled={busy}
              />
            }
          />
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
      <EditorSection title={t("sectionSchedule")}>
        <RoutineScheduleFields
          value={draft.schedule}
          onChange={(value) => set("schedule", value)}
        />
        {/* What all the fields above give, in plain English. Under them, and not
            at the bottom of the screen: it is their result which is read again before
            d'enregistrer. */}
        <RoutineSummary schedule={draft.schedule} model={draft.model || null} />
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
