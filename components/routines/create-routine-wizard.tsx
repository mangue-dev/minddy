"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, cn, toast } from "mangue-ui";
import { Play } from "lucide-react";

import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { BranchCombobox } from "@/components/agent/branch-combobox";
import { ModelCombobox } from "@/components/agent/model-combobox";
import { ReasoningCombobox } from "@/components/agent/reasoning-combobox";
import { SettingsRow } from "@/components/settings/settings-ui";
import { WizardDialog, type WizardStep } from "@/components/wizard/wizard-dialog";
import { RoutinePromptField } from "@/components/routines/routine-prompt-field";
import { RoutineScheduleFields } from "@/components/routines/routine-schedule-fields";
import { SpendCapCombobox } from "@/components/routines/spend-cap-combobox";
import { DEFAULT_MAX_SPEND_PERCENT } from "@/lib/routine-budget";
import { useProjects } from "@/lib/projects-context";
import { useAuth } from "@/lib/auth-context";
import { useGitLinkedProjectsQuery } from "@/lib/use-project-git-link-query";
import { useAgentModelsQuery, useReasoningLevelsFor } from "@/lib/use-agent-models-query";
import { useAgentPreferencesQuery } from "@/lib/use-agent-preferences-query";
import { createRoutineApi, runRoutineNowApi, type Routine } from "@/lib/routines-api";
import {
  browserTimezone,
  describeSchedule,
  nextRunAt,
  weekdayName,
  type RoutineSchedule,
} from "@/lib/routine-schedule";
import { nearestReasoningLevel, type ReasoningLevel } from "@/lib/agent-reasoning";
import type { AssistantMention } from "@/lib/assistant-types";

/**
 * Set up a ROUTINE (MIN-185), by hand: where, what, with what model, at what
 * rythme.
 *
 * **A wizard, not a form**, and it is the only door to creation
 * manual. A routine is resolved in four independent decisions, three of which
 * have no obvious answer; an eight-field form would ask them
 * four at the same time. The [shared shell](components/wizard/wizard-dialog.tsx)
 * provides modal, stepper, animation and buttons — it remains to be said
 * what steps, when each is valid, and what the last one creates.
 *
 * **Nothing is created before validating `schedule`**: close the window by
 * route does not leave an orphan routine to delete, same rule as the key
 * integration. The creation failure is displayed under the step (prop `error` of the
 * shell) without leaving the screen — a model passed out of plan, an unbound repository
 * entre-temps.
 *
 * **The wizard is NOT used to modify.** Editing an existing routine is done
 * in detail, field by field: a wizard is an establishment course,
 * and replaying it to change an hour would take you through four screens.
 */

type StepId = "project" | "job" | "model" | "schedule" | "done";

/** Pre-written instructions for step `job` — the blank page is the real one
    obstacle of this step, and these three describe what a routine does
    better: return to what we never look at spontaneously. */
const EXAMPLE_KEYS = ["exampleSecurity", "exampleDeps", "exampleTests"] as const;

export function CreateRoutineWizard({
  open,
  onOpenChange,
  initialProjectId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opened from the header of a project: this project is already chosen, and its
   * step disappears from the route. */
  initialProjectId?: string | null;
  /** The created routine — the caller selects it and refreshes its list. */
  onCreated: (routine: Routine) => void;
}) {
  const t = useTranslations("Routines");
  const tAgent = useTranslations("Agent");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const { user } = useAuth();
  const { projects } = useProjects();
  const { projectIds: gitLinked, loading: gitLoading } = useGitLinkedProjectsQuery();
  const { defaultModel: providerDefaultModel } = useAgentModelsQuery();
  const { defaultModel, defaultReasoningLevel } = useAgentPreferencesQuery();

  /**
   * ELIGIBLE projects: owned (only the owner can apply for
   * routine — it's his budget that leaves) AND with a linked deposit (without which there is no
   * nothing to clone). Proposing the others would lead to a 403 or a 409.
   */
  const eligible = useMemo(
    () =>
      projects.filter(
        (p) => p.owner_id === user?.id && gitLinked.has(p.id),
      ),
    [projects, gitLinked, user?.id],
  );

  const [chosenProjectId, setChosenProjectId] = useState(initialProjectId ?? "");
  const [prompt, setPrompt] = useState("");
  const [promptMentions, setPromptMentions] = useState<AssistantMention[]>([]);
  const [model, setModel] = useState("");
  const [reasoning, setReasoning] = useState<ReasoningLevel | null>(null);
  // The levels of the model that this routine will rotate (see composing it).
  const reasoningLevels = useReasoningLevelsFor(model || defaultModel || providerDefaultModel);
  /** "" = the default branch of the repository, which is the common case. */
  const [baseBranch, setBaseBranch] = useState("");
  /** What a passage is allowed to spend, as a % of the monthly budget. */
  const [spendCap, setSpendCap] = useState(DEFAULT_MAX_SPEND_PERCENT);
  // The cadence holds in ONE state, the same as the calculation and the sentence
  // readable wait: nothing to recompose between the screen and the server.
  const [schedule, setSchedule] = useState<RoutineSchedule>(() => ({
    frequency: "weekly",
    hour: 9,
    minute: 0,
    weekdays: [1],
    daysOfMonth: [],
    timezone: browserTimezone(),
  }));
  const [stepIndex, setStepIndex] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Routine | null>(null);
  const [launchingNow, setLaunchingNow] = useState(false);

  /** “Launch now” from the final screen: the first pass without
      wait until Monday. The window closes behind — the routine is already
      selected in the column, and its passage is displayed live. */
  const launchNow = async (routineId: string) => {
    setLaunchingNow(true);
    try {
      await runRoutineNowApi(routineId);
      toast.success(t("runStarted"));
      handleOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLaunchingNow(false);
    }
  };

  /**
   * The `project` step disappears when there is nothing to choose: a project
   * pre-chosen (the “+” in a project header) or a single candidate. The project
   * effective is therefore DERIVED, never copied into the state by an effect: the
   * projects and their links arrive via react-query, and a value copied to
   * montage would remain empty forever.
   */
  const skipProject = !!initialProjectId || eligible.length === 1;
  const projectId =
    chosenProjectId || (skipProject ? (initialProjectId ?? eligible[0]?.id ?? "") : "");

  const reset = () => {
    setChosenProjectId(initialProjectId ?? "");
    setPrompt("");
    setPromptMentions([]);
    setModel("");
    setReasoning(null);
    setSpendCap(DEFAULT_MAX_SPEND_PERCENT);
    setSchedule({
      frequency: "weekly",
      hour: 9,
      minute: 0,
      weekdays: [1],
      daysOfMonth: [],
      timezone: browserTimezone(),
    });
    setStepIndex(0);
    setError(null);
    setCreated(null);
    setLaunchingNow(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  /** The cadence in a sentence + the date of the first passage. Calculated with the
      SAME function as the server: this is the only way to check a time zone
      before undergoing it. `null` when the zone entered does not exist. */
  const preview = useMemo<
    { sentence: string; first: string } | { error: string }
  >(() => {
    try {
      const at = nextRunAt(schedule, new Date());
      const sentence = describeSchedule(
        schedule,
        (key, values) => t(key, values),
        { locale, weekdayLabel: (d) => weekdayName(d, locale) },
      );
      return {
        sentence,
        first: new Intl.DateTimeFormat(locale, {
          dateStyle: "full",
          timeStyle: "short",
          timeZone: schedule.timezone,
        }).format(at),
      };
    } catch (err) {
      // The EXACT reason for the refusal, not “unknown zone” for everything: a cadence
      // weekly without a day and a poorly typed time zone are two problems
      // different, and the one we display is the one we need to correct.
      const code = (err as { code?: string }).code;
      return {
        error: code === "unknownTimezone" ? "error_unknownTimezone" : "error_invalidSchedule",
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, locale]);

  /** Does the cadence hold up? (the summary can then only exist) */
  const scheduleOk = !("error" in preview);

  const create = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const { routine } = await createRoutineApi({
        projectId,
        prompt: prompt.trim(),
        promptMentions,
        model: model || null,
        reasoningLevel: reasoning ?? defaultReasoningLevel,
        baseBranch: baseBranch || null,
        maxSpendPercent: spendCap,
        frequency: schedule.frequency,
        hour: schedule.hour,
        minute: schedule.minute,
        weekdays: schedule.weekdays,
        daysOfMonth: schedule.daysOfMonth,
        timezone: schedule.timezone,
      });
      setCreated(routine);
      onCreated(routine);
      setStepIndex(steps.length - 1);
    } catch (err) {
      const code = (err as { code?: string }).code;
      // A known code is translated; the rest is said as it is rather than being
      // replaced by a vague sentence.
      setError(
        code && ROUTINE_ERROR_KEYS.has(code)
          ? t(`error_${code}` as "error_ownerOnly")
          : (err as Error).message,
      );
    } finally {
      setCreating(false);
    }
  };

  const stepDefs: Record<StepId, WizardStep<StepId>> = {
    project: {
      id: "project",
      title: t("stepProjectTitle"),
      subtitle: t("stepProjectDesc"),
      // Clicking a project IS the gesture: a “Continue” would require a second
      // click to confirm what has just been said.
      hideSubmit: eligible.length > 0,
      submitDisabled: !projectId,
      content:
        eligible.length === 0 && !gitLoading ? (
          // No eligible project: say it, and refer to what is missing —
          // an empty list would leave one wondering why.
          <p className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            {t("noEligibleProject")}
          </p>
        ) : (
          <div className="flex flex-col gap-1" role="radiogroup" aria-label={t("stepProjectTitle")}>
            {eligible.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={projectId === p.id}
                onClick={() => {
                  setChosenProjectId(p.id);
                  setStepIndex((i) => i + 1);
                }}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-4 py-3 text-left outline-none transition-colors",
                  projectId === p.id
                    ? "border-brand/50 bg-muted/40"
                    : "border-border hover:border-brand/40 hover:bg-muted/30",
                )}
              >
                <ProjectOrb seed={projectOrbSeed(p)} iconUrl={p.icon_url} className="size-5 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
              </button>
            ))}
          </div>
        ),
    },

    job: {
      id: "job",
      title: t("stepJobTitle"),
      subtitle: t("stepJobDesc"),
      submitDisabled: !prompt.trim(),
      content: (
        <div className="flex flex-col gap-4">
          {/* The SAME field as modifying a routine (detail pane):
              same dictation, same input ceiling, same limited height. */}
          <RoutinePromptField
            autoFocus
            projectId={projectId}
            value={prompt}
            mentions={promptMentions}
            onChange={(value, mentions) => {
              setPrompt(value);
              setPromptMentions(mentions);
            }}
            disabled={creating}
          />

          {/* Three pre-written instructions: they replace the field, they do not
              are not added to it — we choose a starting point, we do not stick
              three examples end to end. */}
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setPrompt(t(key));
                  setPromptMentions([]);
                }}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
              >
                {t(`${key}Label` as "exampleSecurityLabel")}
              </button>
            ))}
          </div>

        </div>
      ),
    },

    model: {
      id: "model",
      title: t("stepModelTitle"),
      subtitle: t("stepModelDesc"),
      content: (
        /* The three agent settings in ROWS — same labels, same
           pastilles and same order as the editor of the detail pane: we do not
           does not relearn the screen when you come back to change a setting. */
        <div className="divide-y divide-border/60">
          <SettingsRow
            label={t("modelLabel")}
            control={
              <ModelCombobox
                variant="compact"
                value={model}
                onChange={setModel}
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
                value={nearestReasoningLevel(
                  reasoning ?? defaultReasoningLevel,
                  reasoningLevels,
                )}
                onChange={setReasoning}
                levels={reasoningLevels}
              />
            }
          />
          {/* The DEPARTURE branch is chosen HERE rather than after the fact: a
              routine that starts from the wrong database opens pull requests
              unusable, and it's when you put it on that you know what
              she has to work. The listing is anchored to the project chosen at
              the previous step. */}
          <SettingsRow
            label={t("baseBranchLabel")}
            control={
              <BranchCombobox
                projectId={projectId}
                value={baseBranch}
                onChange={setBaseBranch}
                defaultLabel={tAgent("branchDefault")}
                defaultHint={tAgent("branchDefaultHint")}
                placeholder={tAgent("branchSearchPlaceholder")}
                emptyLabel={tAgent("branchSearchEmpty")}
                loadingLabel={tAgent("branchSearchLoading")}
                disabled={creating}
              />
            }
          />
          {/* WHAT SHE CAN SPEND, alongside what decides it (the model, the
              reasoning): a routine leaves alone, no one looks at its
              barre d'usage pendant qu'elle travaille. Sans ce plafond, un seul
              The passage could take a whole month. */}
          <SettingsRow
            label={t("spendCapLabel")}
            help={t("spendCapHelp")}
            control={
              <SpendCapCombobox
                value={spendCap}
                onChange={setSpendCap}
                disabled={creating}
              />
            }
          />
        </div>
      ),
    },

    schedule: {
      id: "schedule",
      title: t("stepScheduleTitle"),
      subtitle: t("stepScheduleDesc"),
      wide: true,
      submitLabel: t("createRoutine"),
      submitDisabled: !scheduleOk,
      content: (
        <div className="flex flex-col gap-6">
          {/* The cadence fields are the SAME as when editing a
              routine (`RoutineScheduleFields`): two separate forms
              would have ended up accepting two different things. */}
          <RoutineScheduleFields value={schedule} onChange={setSchedule} />

          {/* The LIVING recap: the phrase and date that the routine goes
              really follow. This is the only way to check a spindle before
              to endure it — and the only place that catches a poorly typed spindle. */}
          {"error" in preview ? (
            <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {t(preview.error as "error_unknownTimezone")}
            </p>
          ) : (
            <p className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
              <span className="font-medium">{preview.sentence}</span>
              <span className="text-muted-foreground">
                {" — "}
                {t("firstRunAt", { date: preview.first })}
              </span>
            </p>
          )}
        </div>
      ),
    },

    done: {
      id: "done",
      title: t("createdTitle"),
      subtitle: t("createdDesc"),
      // The routine EXISTS: one step back would not undo it.
      lockBack: true,
      // The CTA leads to routine — that’s what we just asked, and the
      // closing the leash selected in the column.
      submitLabel: t("seeRoutine"),
      content: (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 rounded-xl border border-brand/25 bg-brand/5 p-4 text-sm">
            <span className="font-medium">{created?.title}</span>
            {"error" in preview ? null : (
              <span className="text-muted-foreground">
                {preview.sentence} — {t("firstRunAt", { date: preview.first })}
              </span>
            )}
          </div>
          {/* The second output: see the routine working right away,
              without waiting for Monday — and WITHOUT moving the deadline (this is the route
              “Launch now” guarantees it, not this button). */}
          {created ? (
            <Button
              type="button"
              variant="outline"
              className="w-full justify-center gap-2"
              disabled={launchingNow}
              onClick={() => void launchNow(created.id)}
            >
              <Play className="size-4" />
              {t("runNow")}
            </Button>
          ) : null}
        </div>
      ),
    },
  };

  const order: StepId[] = [
    ...(skipProject ? [] : (["project"] as const)),
    "job",
    "model",
    "schedule",
    "done",
  ];
  const steps = order.map((id) => stepDefs[id]);

  return (
    <WizardDialog
      open={open}
      onOpenChange={handleOpenChange}
      label={t("newRoutine")}
      steps={steps}
      stepIndex={stepIndex}
      onStepIndexChange={setStepIndex}
      submitting={creating}
      error={error}
      /**
       * A click next to it should not take away the draft. The question is not
       * posed ONLY BETWEEN the two ends of the route: on the first stage it
       * there is nothing to lose, and on `done` the routine already exists — close y
       * IS the way to end. Same rule as the public board wizard.
       */
      dismissConfirm={
        stepIndex > 0 && order[Math.min(stepIndex, order.length - 1)] !== "done"
          ? {
              title: t("quitTitle"),
              description: t("quitDescription"),
              confirmLabel: t("quitConfirm"),
              cancelLabel: t("quitCancel"),
            }
          : undefined
      }
      onSubmit={(id) => {
        if (id === "done") {
          handleOpenChange(false);
          return;
        }
        if (id === "schedule") {
          if (!projectId) {
            toast.error(t("noEligibleProject"));
            return;
          }
          void create();
          return;
        }
        setStepIndex((i) => i + 1);
      }}
    />
  );
}

/** The refusals that the screen knows how to name. The rest is displayed as is. */
const ROUTINE_ERROR_KEYS = new Set([
  "ownerOnly",
  "noRepo",
  "modelAbovePlan",
  "unknownTimezone",
  "invalidSchedule",
  "titleRequired",
  "promptRequired",
]);
