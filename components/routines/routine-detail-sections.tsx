"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, InformationCircleIcon, PauseCircleIcon, PlayCircleIcon } from "@hugeicons/core-free-icons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RoutinePromptField } from "@/components/routines/routine-prompt-field";
import { RoutineScheduleFields } from "@/components/routines/routine-schedule-fields";
import { RoutineTriggerFields, RoutineTriggerSummary } from "@/components/routines/routine-trigger-fields";
import type { AssistantMention } from "@/lib/assistant-types";
import { useAuth } from "@/lib/auth-context";
import { useDescriptionCollaboration } from "@/lib/use-description-collaboration";
import { useMembersQuery } from "@/lib/use-members-query";
import { DEFAULT_MAX_SPEND_PERCENT } from "@/lib/routine-budget";
import { SpendCapSelect } from "@/components/routines/spend-cap-select";
import { parseRoutineTrigger, type RoutineTrigger } from "@/lib/routine-triggers";
import { describeSchedule, weekdayName, type RoutineSchedule } from "@/lib/routine-schedule";
import type { Routine } from "@/lib/routines-api";
import { cn } from "@/lib/utils";

/** The routine fields a section writes, as `updateRoutineApi` takes them. */
export type RoutinePatch = Parameters<typeof import("@/lib/routines-api").updateRoutineApi>[1];

/** How long the trigger fields rest before their change is saved. */
const TRIGGER_SAVE_DELAY_MS = 700;

/**
 * The instruction, written in place (no Edit button): the routines' own
 * variant of the shared editor. It is a live document (MIN-832), like an
 * issue's plan: the owner's tabs and devices, and Numo rewriting it, converge
 * without overwriting typing, and the server writes the text once typing
 * rests. Without a live session (an older server, a failed read) it is saved
 * when the focus leaves it. Either way, an emptied instruction is not saved,
 * and the editor gets the saved one back.
 */
export function RoutineInstruction({
  routine,
  isOwner,
  onSave,
}: {
  routine: Routine;
  isOwner: boolean;
  onSave: (patch: RoutinePatch) => Promise<void>;
}) {
  const t = useTranslations("Routines");
  const tPages = useTranslations("Pages");
  const { user } = useAuth();
  const { members } = useMembersQuery(routine.project_id, true);
  const live = useDescriptionCollaboration({
    kind: "routine",
    id: routine.id,
    userId: user?.id ?? null,
    enabled: true,
    members,
    onRefused: () => toast.error(tPages("liveEditRefused")),
    onFatal: () => toast.error(tPages("saveFailed")),
  });
  const saved = { prompt: routine.prompt, mentions: routine.prompt_mentions ?? [] };
  // Local typing wins until it is saved; without any, the saved instruction
  // shows, rewrites from another device or from Numo included. The page keys
  // this section by routine, so another routine starts clean.
  const [draft, setDraft] = useState<{ prompt: string; mentions: AssistantMention[] } | null>(null);
  const shown = draft ?? saved;
  // A saved draft stays on screen until the routine carries it: dropping it
  // when the request returns showed the previous text until the refetch.
  useEffect(() => {
    if (draft && draft.prompt.trim() === routine.prompt.trim()) setDraft(null);
  }, [routine.prompt]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    if (!draft || live.status !== "unavailable") return;
    const prompt = draft.prompt.trim();
    if (!prompt || (prompt === routine.prompt.trim() && JSON.stringify(draft.mentions) === JSON.stringify(saved.mentions))) {
      setDraft(null);
      return;
    }
    void onSave({ prompt, promptMentions: draft.mentions });
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <h3 className="text-xs font-medium text-muted-foreground">{t("promptLabel")}</h3>
        {/* What runs it, in a word: the former "Numo work" section had no
            setting of its own. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t("sectionAgent")}
              className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <HugeiconsIcon icon={InformationCircleIcon} className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-72">
            {t("workerModelHint")} {t("executionEnvironment")}
          </TooltipContent>
        </Tooltip>
      </div>
      <div
        onBlur={(event) => {
          // A pick in the mention menu or a skill preview stays inside.
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          commit();
        }}
      >
        <RoutinePromptField
          bare
          projectId={routine.project_id}
          baseBranch={null}
          value={shown.prompt}
          mentions={shown.mentions}
          onChange={(prompt, mentions) => setDraft({ prompt, mentions })}
          disabled={!isOwner}
          live={live}
        />
      </div>
    </section>
  );
}

/**
 * The routine's settings, in one compact block: the trigger folds behind its
 * summary, the spending cap is a plain select. Each change is saved on its
 * own; there is no form to submit.
 */
export function RoutineSettings({
  routine,
  isOwner,
  schedule,
  onSave,
}: {
  routine: Routine;
  isOwner: boolean;
  schedule: RoutineSchedule;
  onSave: (patch: RoutinePatch) => Promise<void>;
}) {
  const t = useTranslations("Routines");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState<RoutineTrigger>(routine.trigger ?? { type: "schedule" });
  const [draftSchedule, setDraftSchedule] = useState<RoutineSchedule>(schedule);
  const pending = useRef<number | null>(null);
  const saving = useRef(0);
  const [spendCap, setSpendCap] = useState(routine.max_spend_percent ?? DEFAULT_MAX_SPEND_PERCENT);
  // The saved values are adopted only when they CHANGE, and never while a
  // local change waits or writes: a refresh carrying the previous values
  // made the fields jump back before the save landed.
  const remote = JSON.stringify([routine.trigger ?? null, schedule, routine.max_spend_percent ?? null]);
  const lastRemote = useRef(remote);
  useEffect(() => {
    if (remote === lastRemote.current) return;
    lastRemote.current = remote;
    if (pending.current !== null || saving.current > 0) return;
    setTrigger(routine.trigger ?? { type: "schedule" });
    setDraftSchedule(schedule);
    setSpendCap(routine.max_spend_percent ?? DEFAULT_MAX_SPEND_PERCENT);
  }, [remote]); // eslint-disable-line react-hooks/exhaustive-deps
  const write = (patch: RoutinePatch) => {
    saving.current += 1;
    void onSave(patch).finally(() => {
      saving.current -= 1;
    });
  };
  useEffect(() => () => {
    if (pending.current !== null) window.clearTimeout(pending.current);
  }, []);

  const cadence = (value: RoutineSchedule): string | null => {
    // A cadence being edited may be briefly invalid (no day checked).
    try {
      return describeSchedule(value, (key, values) => t(key, values), {
        locale,
        weekdayLabel: (day) => weekdayName(day, locale),
      });
    } catch {
      return null;
    }
  };

  // A trigger being filled in is often incomplete for a moment (a condition
  // without its value, no database picked yet). It is saved only once the
  // server's own rules accept it; meanwhile the missing values are outlined.
  const triggerComplete = (value: RoutineTrigger) => {
    try {
      parseRoutineTrigger(value);
      return true;
    } catch {
      return false;
    }
  };
  const incomplete = trigger.type !== "schedule" && !triggerComplete(trigger);

  const saveTrigger = (nextTrigger: RoutineTrigger, nextSchedule: RoutineSchedule) => {
    setTrigger(nextTrigger);
    setDraftSchedule(nextSchedule);
    if (pending.current !== null) window.clearTimeout(pending.current);
    pending.current = window.setTimeout(() => {
      pending.current = null;
      if (!triggerComplete(nextTrigger)) return;
      if (nextTrigger.type === "schedule" && cadence(nextSchedule) === null) return;
      write({
        trigger: nextTrigger,
        ...(nextTrigger.type === "schedule" ? {
          frequency: nextSchedule.frequency,
          hour: nextSchedule.hour,
          minute: nextSchedule.minute,
          weekdays: nextSchedule.frequency === "weekly" ? nextSchedule.weekdays : [],
          daysOfMonth: nextSchedule.frequency === "monthly" ? nextSchedule.daysOfMonth : [],
        } : {}),
        timezone: nextSchedule.timezone,
      });
    }, TRIGGER_SAVE_DELAY_MS);
  };

  const summary: ReactNode = trigger.type === "schedule"
    ? <span className="text-xs text-muted-foreground">{cadence(draftSchedule)}</span>
    : <RoutineTriggerSummary trigger={trigger} projectId={routine.project_id} />;

  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      <Collapsible open={isOwner && open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          disabled={!isOwner}
          className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
        >
          <span className="text-sm font-medium">{t("triggerLabel")}</span>
          <span className="ml-auto min-w-0 truncate text-right [&_p]:truncate">{summary}</span>
          {isOwner ? (
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
            />
          ) : null}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-3 px-4 pb-4">
            {incomplete ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">{t("triggerIncompleteHint")}</p>
            ) : null}
            <RoutineTriggerFields
              hideLegend
              highlightMissing={incomplete}
              projectId={routine.project_id}
              value={trigger}
              onChange={(value) => saveTrigger(value, draftSchedule)}
            />
            {trigger.type === "schedule" ? (
              <RoutineScheduleFields
                value={draftSchedule}
                onChange={(value) => saveTrigger(trigger, value)}
              />
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <label htmlFor={`routine-spend-cap-${routine.id}`} className="text-sm font-medium">
            {t("spendCapLabel")}
          </label>
          <p className="text-xs text-muted-foreground">{t("spendCapHelp")}</p>
        </div>
        <SpendCapSelect
          id={`routine-spend-cap-${routine.id}`}
          value={spendCap}
          onChange={(value) => {
            setSpendCap(value);
            write({ maxSpendPercent: value });
          }}
          disabled={!isOwner}
        />
      </div>
    </div>
  );
}

const ROUTINE_STATE_STYLES = {
  active: "bg-green-600/10 text-green-700 dark:bg-green-500/15 dark:text-green-400",
  // The amber of the product's warning badges: not an error, but a state
  // nobody wants to discover by wondering why nothing happened.
  paused: "bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400",
} as const;

const ROUTINE_STATE_ICONS = { active: PlayCircleIcon, paused: PauseCircleIcon } as const;

/** The control keeps its color when hovered or open, as a pull request's state does. */
const ROUTINE_STATE_CONTROL_STYLES = {
  active: "hover:bg-green-600/15 hover:text-green-700 aria-expanded:bg-green-600/15 aria-expanded:text-green-700 focus-visible:bg-green-600/15 dark:hover:bg-green-500/20 dark:hover:text-green-400 dark:aria-expanded:bg-green-500/20 dark:aria-expanded:text-green-400 dark:focus-visible:bg-green-500/20",
  paused: "hover:bg-amber-500/15 hover:text-amber-700 aria-expanded:bg-amber-500/15 aria-expanded:text-amber-700 focus-visible:bg-amber-500/15 dark:hover:bg-amber-400/15 dark:hover:text-amber-400 dark:aria-expanded:bg-amber-400/15 dark:aria-expanded:text-amber-400 dark:focus-visible:bg-amber-400/15",
} as const;

/**
 * The routine's state, and the way to change it, in one control: a badge
 * that opens Active / Paused, like a pull request's state. Readers see the
 * badge alone, and only when the routine is paused: a running routine is the
 * normal case. Resuming needs the scheduler, so "Active" waits for it.
 */
export function RoutineStateControl({
  enabled,
  canChange,
  disabled,
  canResume,
  onChange,
}: {
  enabled: boolean;
  canChange: boolean;
  disabled: boolean;
  canResume: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const t = useTranslations("Routines");
  const state = enabled ? "active" : "paused";
  const label = (value: "active" | "paused") => t(value === "active" ? "active" : "paused");
  if (!canChange) {
    if (enabled) return null;
    return (
      <Badge
        variant="secondary"
        icon={<HugeiconsIcon icon={PauseCircleIcon} />}
        className={cn("shrink-0", ROUTINE_STATE_STYLES.paused)}
      >
        {label("paused")}
      </Badge>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          data-testid="routine-state-control"
          className={cn("h-8 shrink-0 gap-1.5", ROUTINE_STATE_STYLES[state], ROUTINE_STATE_CONTROL_STYLES[state])}
        >
          <HugeiconsIcon icon={ROUTINE_STATE_ICONS[state]} className="size-4" />
          {label(state)}
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(["active", "paused"] as const).map((value) => (
          <DropdownMenuItem
            key={value}
            disabled={value === state || (value === "active" && !canResume)}
            onSelect={() => onChange(value === "active")}
            data-testid={`routine-state-${value}`}
          >
            <HugeiconsIcon
              icon={ROUTINE_STATE_ICONS[value]}
              className={cn("size-4", ROUTINE_STATE_STYLES[value], "bg-transparent dark:bg-transparent")}
            />
            {label(value)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
