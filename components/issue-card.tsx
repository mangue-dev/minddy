"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSortable } from "@dnd-kit/sortable";
import { useTranslations, useFormatter } from "next-intl";
import {
  ConfirmDeleteDialog,
  Spinner,
  cn,
  toast,
} from "mangue-ui";
import { AgentBeam } from "@/components/agent-beam";
import {
  Calendar,
  ChevronRight,
  GitMerge,
  GitPullRequest,
  IterationCw,
  Link2,
  ListChecks,
  Repeat,
  Target,
  Trash2,
  Triangle,
  User,
} from "lucide-react";
import { useAgentMenuActions } from "@/components/agent/use-agent-menu-actions";
import {
  CustomPromptDialog,
  type CustomPromptTarget,
} from "@/components/agent/custom-prompt-dialog";
import {
  ALL_STATUSES,
  PRIORITIES,
  EFFORTS,
  isClosedStatus,
  issueIdentifier,
  type IssueStatus,
  type IssuePriority,
  type IssueEffort,
} from "@/lib/issue-constants";
import { displayName } from "@/lib/display-name";
import { UserAvatar } from "@/components/user-avatar";
import { IntegrationIndicator } from "@/components/integration-indicator";
import { RemoteIssueIndicator } from "@/components/remote-issue-indicator";
import {
  StatusIndicator,
  PriorityIndicator,
  EffortIndicator,
  RelationIcon,
} from "@/components/issue-indicators";
import { RelationChips, type ChipRelation } from "@/components/relation-chips";
import { RelationTargetPicker } from "@/components/relation-target-picker";
import {
  useAgentActive,
  useAgentHasSession,
  useIssuePr,
} from "@/components/agent/agent-activity-context";
import { handOffIssueApi, isPrWorthShowing, type IssuePr } from "@/lib/agent-api";
import {
  setAgentComposeDraft,
  type AgentComposeIntent,
} from "@/lib/agent-compose-draft";
import { usePlanGates } from "@/lib/use-billing-query";
import { useProjectGitLinkQuery } from "@/lib/use-project-git-link-query";
import { getDesktopBridge } from "@/lib/desktop/bridge";
import {
  agentLaunchPromptVariant,
  agentPlanPromptVariant,
} from "@/lib/agent-launch-prompt";
import { RELATION_TYPES } from "@/lib/relation-constants";
import { NO_LAYOUT_ANIMATION, type CardDragData } from "@/lib/board-dnd";
import type {
  Category,
  Issue,
  IssueCardCategory,
  IssueCardIssue,
  IssueCardObjective,
  IssueRelationType,
  IssueUpdateInput,
  Member,
  Objective,
  Project,
} from "@/lib/types";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { DateTimePicker } from "@/components/date-time-picker";
import {
  SearchSelect,
  SearchMultiSelect,
  type PickerOption,
} from "@/components/search-select";
import {
  IssueContextMenu,
  type ContextMenuAction,
} from "@/components/issue-context-menu";
import {
  IssueShortcutMenu,
  KEY_FOR_FIELD,
  useIssueFieldShortcuts,
  type ShortcutField,
} from "@/components/issue-field-shortcuts";
import {
  buildIssueCustomPrompt,
  buildIssuePlanPrompt,
  buildIssuePrompt,
  buildIssueVerifyPrompt,
} from "@/lib/issue-prompt";
import { useAskNumoTarget } from "@/lib/ask-numo-context";
import { useStableCallback } from "@/lib/use-stable-callback";
import { useCategoryCreateOption } from "@/lib/use-picker-create";
import { useAuth } from "@/lib/auth-context";
import { useQueryClient } from "@tanstack/react-query";
import { DropOverlay, useFileDrop } from "@/components/resources";
import { useAttachmentUploads } from "@/lib/use-attachment-uploads";
import { addIssueResourcesApi } from "@/lib/use-issue-resources";
import {
  resolvePromptCopyAutoStart,
  shouldAutoStartOnPromptCopy,
} from "@/lib/prompt-copy-auto-start";
import { dueDateFormat, parseDueDate } from "@/lib/due-date";
import type { RecurrenceCadence } from "@/lib/recurrence";
import { TRASH_RETENTION_DAYS } from "@/lib/trash-retention";
import { hasPlanTasks, planProgress, type PlanProgress } from "@/lib/plan";
import { plainMarkdown } from "@/lib/plain-markdown";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Strip common markdown so the description preview reads as plain text.
 *
 * ⚠ Called on a SLICE of the description, never on the entire description
 * (MIN-316): eight regular expressions including one not anchored
 * (```` ```[\s\S]*?``` ````) on a body of several kilobytes, each
 * rendering of each card — for a preview rendered in `line-clamp-3`.
 */
/* ── Inline indicator pickers ────────────────────────────────────────────
   Each indicator on the card is a dropdown trigger: clicking it edits the
   field in place. `stop` keeps the click/drag from bubbling to the card (which
   would open the side panel or start a drag). Without an `onChange` the picker
   renders the plain indicator (e.g. inside the drag overlay). */

const TRIGGER_CLASS =
  "-m-0.5 flex items-center rounded-md p-0.5 outline-none transition-colors hover:bg-muted focus-visible:bg-muted";

// Roomier hit area for the smaller indicators (priority / effort / category).
const TRIGGER_CLASS_LG =
  "-m-1.5 flex min-w-0 items-center rounded-md p-1.5 outline-none transition-colors hover:bg-muted focus-visible:bg-muted";

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/** Closed menu: stable identity, so a new array is not created on every render. */
const NO_ACTIONS: ContextMenuAction[] = [];

function StatusPick({
  value,
  onChange,
}: {
  value: IssueStatus;
  onChange?: (v: IssueStatus) => void;
}) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const tStatus = useTranslations("Status");
  if (!onChange) return <StatusIndicator status={value} />;
  const options: PickerOption[] = ALL_STATUSES.map((s) => ({
    value: s.value,
    label: tStatus(s.value),
    icon: <StatusIndicator status={s.value} className="size-4" />,
  }));
  return (
    <SearchSelect
      value={value}
      onChange={(v) => onChange(v as IssueStatus)}
      options={options}
      align="start"
      tooltip={tField("status")}
      shortcutHint={KEY_FOR_FIELD.status}
      stopPropagation
      trigger={
        <button
          type="button"
          aria-label={t("changeStatusAria")}
          onClick={stop}
          onPointerDown={stop}
          className={TRIGGER_CLASS}
        >
          <StatusIndicator status={value} />
        </button>
      }
    />
  );
}

function PriorityPick({
  value,
  onChange,
}: {
  value: IssuePriority;
  onChange?: (v: IssuePriority) => void;
}) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const tPriority = useTranslations("Priority");
  if (!onChange) return <PriorityIndicator priority={value} />;
  const options: PickerOption[] = PRIORITIES.map((p) => ({
    value: p.value,
    label: tPriority(p.value),
    icon: <PriorityIndicator priority={p.value} className="size-4" />,
  }));
  return (
    <SearchSelect
      value={value}
      onChange={(v) => onChange(v as IssuePriority)}
      options={options}
      align="start"
      tooltip={tField("priority")}
      shortcutHint={KEY_FOR_FIELD.priority}
      stopPropagation
      trigger={
        <button
          type="button"
          aria-label={t("changePriorityAria")}
          onClick={stop}
          onPointerDown={stop}
          className={TRIGGER_CLASS_LG}
        >
          <PriorityIndicator priority={value} />
        </button>
      }
    />
  );
}

function EffortPick({
  value,
  onChange,
}: {
  value: IssueEffort | null;
  onChange?: (v: IssueEffort | null) => void;
}) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const tCommon = useTranslations("Common");
  const display = value ? (
    <EffortIndicator effort={value} />
  ) : (
    <span className="inline-flex items-center gap-1 text-muted-foreground/60">
      <Triangle className="size-[18px] shrink-0" />
      <span className="text-sm font-medium leading-none">–</span>
    </span>
  );
  if (!onChange) return display;
  const options: PickerOption[] = EFFORTS.map((e) => ({
    value: e.value,
    label: e.label,
  }));
  return (
    <SearchSelect
      value={value}
      onChange={(v) => onChange(v as IssueEffort | null)}
      options={options}
      noneOption={{ label: tCommon("none") }}
      align="start"
      tooltip={tField("effort")}
      shortcutHint={KEY_FOR_FIELD.effort}
      stopPropagation
      trigger={
        <button
          type="button"
          aria-label={t("changeEffortAria")}
          onClick={stop}
          onPointerDown={stop}
          className={TRIGGER_CLASS_LG}
        >
          {display}
        </button>
      }
    />
  );
}

/** The pills as they appear on the card — without a menu. This is all the
 *  PUBLIC board renders (no callbacks), and it has neither react-query nor
 *  creation dialogs: the menu, with its hooks, lives in the sibling component
 *  and is mounted only when the card is editable. */
function CategoryDisplay({
  categories,
  selectedIds,
}: {
  categories: IssueCardCategory[];
  selectedIds: string[];
}) {
  const t = useTranslations("IssueUI");
  const selected = categories.filter((c) => selectedIds.includes(c.id));
  const first = selected[0];
  const extra = Math.max(0, selected.length - 1);
  return first ? (
    <span className="flex min-w-0 items-center gap-1.5 text-xs">
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: first.color }}
        aria-hidden
      />
      <span className="truncate">{first.name}</span>
      {extra > 0 && <span className="shrink-0 text-muted-foreground">+{extra}</span>}
    </span>
  ) : (
    <span className="text-xs text-muted-foreground/60">{t("noneFem")}</span>
  );
}

function CategoryPick({
  categories,
  selectedIds,
  onChange,
  projectId,
}: {
  categories: IssueCardCategory[];
  selectedIds: string[];
  onChange?: (ids: string[]) => void;
  /** Card project — anything quick-add creates belongs to it. */
  projectId?: string | null;
}) {
  const display = (
    <CategoryDisplay categories={categories} selectedIds={selectedIds} />
  );
  if (!onChange) return display;
  return (
    <CategoryPickMenu
      categories={categories}
      selectedIds={selectedIds}
      onChange={onChange}
      projectId={projectId}
      display={display}
    />
  );
}

function CategoryPickMenu({
  categories,
  selectedIds,
  onChange,
  projectId,
  display,
}: {
  categories: IssueCardCategory[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  projectId?: string | null;
  display: React.ReactNode;
}) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const createOption = useCategoryCreateOption({
    projectId,
    categories,
    onCreated: (category) => onChange([...selectedIds, category.id]),
  });
  const options: PickerOption[] = categories.map((c) => ({
    value: c.id,
    label: c.name,
    icon: (
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: c.color }}
        aria-hidden
      />
    ),
  }));
  return (
    <SearchMultiSelect
      values={selectedIds}
      onChange={onChange}
      options={options}
      createOption={createOption}
      align="end"
      tooltip={tField("categories")}
      shortcutHint={KEY_FOR_FIELD.category}
      stopPropagation
      emptyText={categories.length === 0 ? t("noCategoriesHint") : undefined}
      trigger={
        <button
          type="button"
          aria-label={t("editCategoriesAria")}
          onClick={stop}
          onPointerDown={stop}
          className={TRIGGER_CLASS_LG}
        >
          {display}
        </button>
      }
    />
  );
}

function AssigneePick({
  assignee,
  members,
  onChange,
}: {
  assignee: Member | null;
  members: Member[];
  onChange?: (id: string | null) => void;
}) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const avatar = assignee ? (
    <UserAvatar
      seed={assignee.avatar_seed}
      title={displayName(assignee)}
      className="size-6"
    />
  ) : (
    <span
      className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground/60"
      title={tField("unassigned")}
    >
      <User className="size-3.5" />
    </span>
  );
  if (!onChange) return avatar;
  const options: PickerOption[] = members.map((m) => ({
    value: m.user_id,
    label: displayName(m),
    keywords: m.email ? [m.email] : undefined,
    icon: (
      <UserAvatar
        seed={m.avatar_seed}
        className="size-5"
      />
    ),
  }));
  return (
    <SearchSelect
      value={assignee?.user_id ?? null}
      onChange={onChange}
      options={options}
      noneOption={{ label: tField("unassigned") }}
      align="end"
      tooltip={tField("assignee")}
      shortcutHint={KEY_FOR_FIELD.assignee}
      stopPropagation
      trigger={
        <button
          type="button"
          aria-label={t("changeAssigneeAria")}
          onClick={stop}
          onPointerDown={stop}
          className="rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:opacity-80"
        >
          {avatar}
        </button>
      }
    />
  );
}

function DueDatePick({
  value,
  onChange,
  recurrence,
  onRecurrenceChange,
}: {
  value: string;
  onChange?: (v: string | null) => void;
  recurrence: RecurrenceCadence | null;
  onRecurrenceChange?: (next: {
    due_date: string | null;
    recurrence: RecurrenceCadence | null;
  }) => void;
}) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const format = useFormatter();
  const parsed = parseDueDate(value);
  if (!parsed) return null;

  // Read-only (e.g. inside the drag overlay): plain label, no picker.
  if (!onChange) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {recurrence ? (
          <Repeat className="size-3 shrink-0" />
        ) : (
          <Calendar className="size-3 shrink-0" />
        )}
        {format.dateTime(parsed, dueDateFormat(parsed, { compact: true }))}
      </span>
    );
  }

  return (
    <DateTimePicker
      variant="chip"
      value={value}
      onChange={onChange}
      recurrence={recurrence}
      onRecurrenceChange={onRecurrenceChange}
      ariaLabel={t("changeDueDateAria")}
      tooltip={tField("dueDate")}
      shortcutHint={KEY_FOR_FIELD.dueDate}
      stopPropagation
    />
  );
}

/** Read-only objective indicator on the card — colored dot + name, shown on the
    bottom line (mirrors how the category is displayed). */
function ObjectiveIndicator({ objective }: { objective: IssueCardObjective }) {
  const tField = useTranslations("Field");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: objective.color ?? "var(--muted-foreground)" }}
            aria-hidden
          />
          <span className="truncate">{objective.name}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tField("objectiveLinked")}</TooltipContent>
    </Tooltip>
  );
}

/** Compact plan progress on the card header: checklist icon + "done/total".
    Clicking it opens the side panel straight on the plan tab. Read-only (plain
    span, no handler) inside the drag overlay. Shown only when the plan has tasks. */
function PlanPick({
  progress,
  onOpen,
}: {
  progress: PlanProgress;
  onOpen?: () => void;
}) {
  const t = useTranslations("IssueUI");
  const content = (
    <>
      <ListChecks className="size-3.5 shrink-0" />
      <span className="tabular-nums">
        {progress.done}/{progress.total}
      </span>
    </>
  );
  if (!onOpen) {
    return (
      <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        {content}
      </span>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={t("viewPlanAria")}
          onClick={(e) => {
            stop(e);
            onOpen();
          }}
          onPointerDown={stop}
          className="flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted"
        >
          {content}
        </button>
      </TooltipTrigger>
      <TooltipContent>{t("viewPlanAria")}</TooltipContent>
    </Tooltip>
  );
}

/** The pull request in the card header, in place of the plan. Clicking opens
    its review. Read-only (a span without a handler) in the drag overlay / public board.

    The colors are GitHub's, as everywhere else: GREEN when open,
    PURPLE when merged. The chip used to be green in every state — announcing
    “PR available” in green for work already delivered, while the side-panel
    chip said “PR merged” in purple one click away. */
function PrPick({
  state,
  onOpen,
}: {
  state: IssuePr["state"];
  onOpen?: () => void;
}) {
  const t = useTranslations("Agent");
  const merged = state === "merged";
  const content = (
    <>
      {merged ? (
        <GitMerge className="size-3.5 shrink-0" />
      ) : (
        <GitPullRequest className="size-3.5 shrink-0" />
      )}
      <span className="truncate">{merged ? t("prMerged") : t("prBadge")}</span>
    </>
  );
  const tone = merged
    ? "text-violet-700 dark:text-violet-400"
    : "text-emerald-600 dark:text-emerald-500";
  if (!onOpen) {
    return (
      <span className={cn("flex items-center gap-1 text-[11px] font-medium", tone)}>
        {content}
      </span>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={t("viewPullRequest")}
          onClick={(e) => {
            stop(e);
            onOpen();
          }}
          onPointerDown={stop}
          className={cn(
            "flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-medium outline-none transition-colors",
            tone,
            merged
              ? "hover:bg-violet-500/10 focus-visible:bg-violet-500/10"
              : "hover:bg-emerald-500/10 focus-visible:bg-emerald-500/10",
          )}
        >
          {content}
        </button>
      </TooltipTrigger>
      <TooltipContent>{t("viewPullRequest")}</TooltipContent>
    </Tooltip>
  );
}

/** Presentational card body — shared by the sortable card and the drag overlay. */
/**
 * ⚠ Memoized (MIN-316). The card runs about fifteen hooks, and the board
 * renders N of them: without `memo`, one provider render or crossing a scroll
 * threshold would replay them all. **For this to matter, props must be stable**
 * — that is the purpose of the ticket-argument callbacks and the lazy menu below.
 */
export const IssueCardBody = memo(function IssueCardBody({
  issue,
  projectKey,
  project,
  memberMap,
  categoryMap,
  objectiveMap,
  parentNumber,
  relations,
  onOpenParent,
  onOpenRelated,
  onOpenPlan,
  onUpdate,
  onSetCategories,
  inCurrentCycle,
  dragging,
  selected,
  pr,
  onOpenPr,
}: {
  /** The card declares what it reads, not what a ticket contains (MIN-342):
      a complete `Issue` remains assignable, and a public surface can pass only
      a projection without sending anything else into the HTML. */
  issue: IssueCardIssue;
  projectKey: string;
  /** On the cross-project (global) boards, the issue's project — renders an
      origin-project chip at the top of the card. Omitted on project boards. */
  project?: Project;
  memberMap: Map<string, Member>;
  categoryMap: Map<string, IssueCardCategory>;
  /** Objectives by id — the linked one shows as a bottom-line indicator. */
  objectiveMap?: Map<string, IssueCardObjective>;
  /** Parent issue's number — when set, the card is a sub-issue and shows the
      parent identifier + chevron before its own identifier. */
  parentNumber?: number;
  /** This issue's relations (blocks/blocked-by/related), pre-sorted by priority —
      the highest-signal one shows as a chip after the identifier. */
  relations?: ChipRelation[];
  /** Opens the parent's side panel (clicking the parent identifier). */
  onOpenParent?: () => void;
  /** Opens a related issue's side panel (clicking a relation chip). */
  onOpenRelated?: (issueId: string) => void;
  /** Opens this issue's side panel on the plan tab (clicking the plan indicator). */
  onOpenPlan?: () => void;
  /** The ticket's PR, in any state. The “PR available” chip is shown
      (IN PLACE of the plan) only if it still calls for action — a
      REJECTED PR calls for nothing, and hiding the plan's progress for it would
      lose useful information. The menu still leads to it in every state. */
  pr?: IssuePr | null;
  /** Opens the pull request review (clicking the “PR available” chip). */
  onOpenPr?: () => void;
  /** When set, the status/priority/effort/assignee/due indicators become pickers. */
  onUpdate?: (patch: IssueUpdateInput) => void;
  /** When set, the category indicator becomes an inline multi-select picker. */
  onSetCategories?: (ids: string[]) => void;
  /** The issue belongs to MY current cycle (MIN-32) — shows the blue cycle
      icon before the identifier. Boards leave it unset in cycle view (where
      every card is in the cycle, the icon would be noise). */
  inCurrentCycle?: boolean;
  selected?: boolean;
  dragging?: boolean;
}) {
  const t = useTranslations("IssueUI");
  const tCycles = useTranslations("Cycles");
  const plan = planProgress(issue.plan);
  const assignee = issue.assignee_id
    ? memberMap.get(issue.assignee_id) ?? null
    : null;
  const objective =
    issue.objective_id && objectiveMap
      ? objectiveMap.get(issue.objective_id) ?? null
      : null;
  // Memoized, and limited to the first 400 characters: three truncated lines
  // need no more, and the rest of the body is never read (MIN-316).
  // Picker lists are memoized (MIN-316): `[...map.values()]` is a new array on
  // every render, which creates new `options` for every picker and rebuilds all
  // their JSX icons — even for CLOSED menus.
  const memberList = useMemo(() => [...memberMap.values()], [memberMap]);
  const categoryList = useMemo(() => [...categoryMap.values()], [categoryMap]);

  const description = useMemo(
    () => (issue.description ? plainMarkdown(issue.description.slice(0, 400)) : ""),
    [issue.description]
  );

  const setStatus = onUpdate
    ? (status: IssueStatus) => onUpdate({ status })
    : undefined;
  const setPriority = onUpdate
    ? (priority: IssuePriority) => onUpdate({ priority })
    : undefined;
  const setEffort = onUpdate
    ? (effort: IssueEffort | null) => onUpdate({ effort })
    : undefined;
  const setAssignee = onUpdate
    ? (id: string | null) => onUpdate({ assignee_id: id })
    : undefined;
  const setDueDate = onUpdate
    ? (date: string | null) => onUpdate({ due_date: date })
    : undefined;
  // Recurrence and due date are sent together in one write (MIN-136).
  const setRecurrence = onUpdate
    ? (next: { due_date: string | null; recurrence: RecurrenceCadence | null }) =>
        onUpdate(next)
    : undefined;

  return (
    <div
      className={cn(
        // Cards sit on the column: in light mode, a border and black shadow
        // around white content created an overly prominent band. The current
        // contrast remains useful on a dark background.
        "flex flex-col gap-2 rounded-xl border border-border/60 p-3 text-left shadow-none dark:border-border dark:shadow-xs",
        // Bulk selection (MIN-75): blue-tinted background instead of an outline.
        selected ? "bg-primary/10" : "bg-card",
        dragging && "cursor-grabbing shadow-lg"
      )}
    >
      {/* Cross-project boards only: the issue's origin project (orb + name). */}
      {project && (
        <div className="-mb-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ProjectOrb seed={projectOrbSeed(project)} iconUrl={project.icon_url} className="size-3.5" />
          <span className="truncate">{project.name}</span>
        </div>
      )}

      {/* Identifier (prefixed by cycle / integration icons when applicable) + assignee */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 font-mono text-[11px] text-muted-foreground">
          {inCurrentCycle && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex shrink-0 items-center text-blue-500 dark:text-blue-400">
                  <IterationCw className="size-3" aria-label={tCycles("inCurrentCycle")} />
                </span>
              </TooltipTrigger>
              <TooltipContent>{tCycles("inCurrentCycle")}</TooltipContent>
            </Tooltip>
          )}
          <IntegrationIndicator issue={issue} iconClassName="size-3" />
          <RemoteIssueIndicator issue={issue} iconClassName="size-3" />
          {parentNumber != null &&
            (onOpenParent ? (
              <button
                type="button"
                onClick={(e) => {
                  stop(e);
                  onOpenParent();
                }}
                onPointerDown={stop}
                aria-label={t("openParentAria", {
                  id: issueIdentifier(projectKey, parentNumber),
                })}
                className="rounded-sm transition-colors hover:text-foreground hover:underline"
              >
                {issueIdentifier(projectKey, parentNumber)}
              </button>
            ) : (
              <span>{issueIdentifier(projectKey, parentNumber)}</span>
            ))}
          {/* The chevron alone does not explain the prefix: on a sub-issue,
              hovering “› MIN-42” names the relation — “Sub-issue of MIN-12”. */}
          {parentNumber == null ? (
            <span className="truncate">{issueIdentifier(projectKey, issue.number)}</span>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex min-w-0 items-center gap-1">
                  <ChevronRight className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">
                    {issueIdentifier(projectKey, issue.number)}
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {t("subIssueOf", {
                  id: issueIdentifier(projectKey, parentNumber),
                })}
              </TooltipContent>
            </Tooltip>
          )}
          {relations && relations.length > 0 && (
            <RelationChips
              relations={relations}
              projectKey={projectKey}
              onOpen={onOpenRelated}
              max={1}
              className="shrink-0"
            />
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {/* PR disponible → remplace l'indicateur de plan ; sinon le plan. */}
          {pr && isPrWorthShowing(pr) ? (
            <PrPick state={pr.state} onOpen={onOpenPr} />
          ) : plan.total > 0 ? (
            <PlanPick progress={plan} onOpen={onOpenPlan} />
          ) : null}
          <AssigneePick
            assignee={assignee}
            members={memberList}
            onChange={setAssignee}
          />
        </span>
      </div>

      {/* Title + description (tight spacing between them, and to the row above) */}
      <div className="-mt-1 flex flex-col gap-0.5">
        <p className="line-clamp-2 text-sm font-semibold leading-snug">
          {issue.title}
        </p>
        {description && (
          <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>

      {/* Indicators — spread edge-to-edge: status · priority · effort · category */}
      <div className="flex items-center justify-between pt-0.5">
        <StatusPick value={issue.status} onChange={setStatus} />
        <PriorityPick value={issue.priority} onChange={setPriority} />
        <EffortPick value={issue.effort} onChange={setEffort} />
        <CategoryPick
          categories={categoryList}
          selectedIds={issue.category_ids}
          onChange={onSetCategories}
          projectId={issue.project_id}
        />
      </div>

      {/* Bottom line — linked objective (left) + due date (right) */}
      {(objective || issue.due_date) && (
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex min-w-0 flex-1 items-center">
            {objective && <ObjectiveIndicator objective={objective} />}
          </div>
          {issue.due_date && (
            <div className="shrink-0">
              <DueDatePick
                value={issue.due_date}
                onChange={setDueDate}
                recurrence={issue.recurrence}
                onRecurrenceChange={setRecurrence}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export const IssueCard = memo(function IssueCard({
  issue,
  projectId,
  projectKey,
  project,
  memberMap,
  categoryMap,
  objectiveMap,
  parent,
  relations,
  candidateIssues,
  onOpenIssue,
  onOpenRelated,
  onAddRelation,
  onOpenPlan,
  onUpdateIssue,
  onSetCategories,
  onDelete,
  buildMenuActions,
  inCurrentCycle,
  selected,
  dragging,
  onSelect,
}: {
  issue: Issue;
  projectId: string;
  projectKey: string;
  /** Cross-project boards: the issue's project (shows an origin-project chip). */
  project?: Project;
  memberMap: Map<string, Member>;
  categoryMap: Map<string, Category>;
  objectiveMap?: Map<string, Objective>;
  /** The PARENT ticket, when this is a sub-issue: the card shows its
      identifier and a chevron before its own, and clicking opens it. The object
      rather than only its number is what lets `onOpenIssue` be bound INSIDE the
      card while keeping props stable (MIN-316). */
  parent?: Issue | null;
  relations?: ChipRelation[];
  /** All project issues — candidates for the "add relation" picker. */
  candidateIssues?: Issue[];
  onOpenRelated?: (issueId: string) => void;
  /** Adds a relation from this issue (source) to the picked target. When set,
      the right-click menu gains the three "mark as…" relation actions. */
  onAddRelation?: (
    sourceId: string,
    type: IssueRelationType,
    targetId: string
  ) => void;
  onOpenPlan?: (issue: Issue) => void;
  /** Opens the ticket panel. **Takes the ticket as an argument**, as
      `onUpdateIssue` already does: an arrow function bound by the column would
      be new on every render and bypass `memo` (MIN-316). */
  onOpenIssue: (issue: Issue) => void;
  onUpdateIssue: (issueId: string, patch: IssueUpdateInput) => void;
  onSetCategories: (issueId: string, ids: string[]) => void;
  /** Trash: when wired by the board, right-click gains “Move to trash”
      (with confirmation first, as in the issue panel). */
  onDelete?: (issueId: string) => Promise<void>;
  /** Right-click actions supplied by the board (add/remove from cycle —
      MIN-32). **A factory, not an array**: it is called only when the menu
      OPENS (MIN-316). */
  buildMenuActions?: (issue: Issue) => ContextMenuAction[];
  /** The issue belongs to MY current cycle — forwarded to the card body. */
  inCurrentCycle?: boolean;
  selected?: boolean;
  /** The card moves with the active drag without being the one held: this is
      the case for other selected tickets, which fade with it. */
  dragging?: boolean;
  onSelect?: (issueId: string) => void;
}) {
  const t = useTranslations("IssueUI");
  const tRel = useTranslations("Relations");
  const tAttach = useTranslations("Resources");
  const tAgent = useTranslations("Agent");
  const tPlan = useTranslations("Plan");
  const tCommon = useTranslations("Common");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // The sortable now serves only TWO purposes: grabbing the card and acting as
  // a hover target. It no longer animates anything — neither the shift during
  // dragging (`NO_SHIFT_STRATEGY`) nor the FLIP after dropping (`animateLayoutChanges`).
  // That FLIP was redundant: the optimistic cache already moves the card on
  // arrival, and dnd-kit replayed the path from the old position on top of it —
  // two animations for one move, hence the jump on release.
  // `columnStatus` is what collision detection reads to attach a card to its
  // column (lib/board-dnd.ts).
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: issue.id,
    data: { columnStatus: issue.status } satisfies CardDragData,
    animateLayoutChanges: NO_LAYOUT_ANIMATION,
  });
  const agentActive = useAgentActive(issue.id);
  // An agent run is ACTIVE on the issue → the action OPENS its conversation.
  // Otherwise (no run, or all completed), it LAUNCHES a new one from scratch (MIN-68).
  const agentHasSession = useAgentHasSession(issue.id);
  const { agentsAllowed } = usePlanGates();
  // Agent + PR are unavailable without a linked repository (MIN-80): the server
  // rejects a `noRepo` launch anyway, so remove the option early. Stay permissive
  // while the query loads → no flash in the common case (project WITH a repository).
  const { link: repoLink, loading: repoLinkLoading } = useProjectGitLinkQuery(
    issue.project_id
  );
  // In the desktop app a local run needs NO linked repository: it plays on the
  // folder attached to this machine. In the browser the link stays the only
  // door (the server refuses a `noRepo` cloud launch anyway).
  const desktopAvailable = useMemo(() => !!getDesktopBridge(), []);
  const agentsEnabled =
    agentsAllowed && (repoLinkLoading || repoLink != null || desktopAvailable);
  // The ticket's PR → chip on the card (if it still calls for action) and
  // “View pull request” in the menu (whatever its state).
  // `?pr=` rather than `?run=`: the link must also work for a PR that no run
  // has opened — a human PR, or a PR linked manually (MIN-163).
  const pr = useIssuePr(issue.id);
  const router = useRouter();

  // Card bindings are made HERE rather than by the column (MIN-316).
  // The received props take the ticket as an argument and are therefore stable
  // between renders; these callbacks close over `issue` without breaking the
  // card's memoization.
  const openIssue = useCallback(() => onOpenIssue(issue), [onOpenIssue, issue]);

  // Idem pour le menu de raccourcis (MIN-316) : trois tableaux neufs par rendu.
  const cardMemberList = useMemo(() => [...memberMap.values()], [memberMap]);
  const cardCategoryList = useMemo(
    () => [...categoryMap.values()],
    [categoryMap]
  );
  const cardObjectiveList = useMemo(
    () => (objectiveMap ? [...objectiveMap.values()] : []),
    [objectiveMap]
  );
  const openParent = useMemo(
    () => (parent ? () => onOpenIssue(parent) : undefined),
    [onOpenIssue, parent]
  );
  const openPlan = useMemo(
    () => (onOpenPlan ? () => onOpenPlan(issue) : undefined),
    [onOpenPlan, issue]
  );
  const openPr = pr
    ? () => router.push(`/pull-requests?pr=${pr.prId}`)
    : undefined;

  // Drop files from the OS directly onto the card (MIN-24) — each file is
  // recorded on the issue once its upload completes. Distinct from dnd-kit
  // drag (pointer events): no conflict.
  const identifier = issueIdentifier(projectKey, issue.number);
  const uploads = useAttachmentUploads(() => `projects/${issue.project_id}`, {
    onUploaded: (input, localId) => {
      addIssueResourcesApi(issue.id, [input])
        .then(() => {
          void queryClient.invalidateQueries({
            queryKey: ["issue-resources", issue.id],
          });
          toast.success(tAttach("addedTo", { id: identifier }));
        })
        .catch((e) => toast.error((e as Error).message))
        .finally(() => uploads.remove(localId));
    },
  });
  const drop = useFileDrop(uploads.addFiles);
  // Context menu (right-click) — pointer viewport position, null = closed.
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(
    null
  );
  // Remembered position of the last right-click: the relation picker opens in
  // the same place as the menu that just closed.
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  // Relation being added (type chosen) → opens the target picker.
  const [relationType, setRelationType] = useState<IssueRelationType | null>(null);
  // Confirmation before trash (the “Move to trash” entry).
  const [confirmDelete, setConfirmDelete] = useState(false);
  // “Custom”: the free-form prompt dialog, opened either to copy the prompt or
  // launch the agent (`null` = closed).
  const [customTarget, setCustomTarget] = useState<CustomPromptTarget | null>(null);
  // Code agent for this ticket (MIN-46) — right-click menu + ⇧A shortcut. Redirects
  // to the Agents page rather than opening a modal. Two entry points:
  //  • openAgentSession — rouvre la session existante (sa run la plus active, `?issue=`) ;
  //  • startNewAgentSession — pose un brouillon de composition optimiste et ouvre son
  //    composer (`?compose=`), launching a NEW session even if the ticket already has
  //    one (a new run on the ticket), exactly like the issue-panel button.
  const openAgentSession = () => {
    router.push(`/agents?issue=${issue.id}`);
  };
  const composeAgentSession = (
    prompt: string,
    intent: AgentComposeIntent = "implement"
  ) => {
    setAgentComposeDraft({
      kind: "issue",
      issueId: issue.id,
      issueNumber: issue.number,
      issueTitle: issue.title,
      projectId: issue.project_id,
      projectKey,
      prompt,
      intent,
    });
    router.push(`/agents?compose=${issue.id}`);
  };
  const startNewAgentSession = () => {
    // “Implement the ticket” ALWAYS arrives with its pre-written prompt
    // (ticket context, adapted to its plan / effort) — like the other three
    // ways of working in the same submenu. It used to be empty when the ticket
    // already had a session, on the assumption that the context was inherited:
    // from the user's perspective, the same menu entry filled the composer only
    // every other time, without explaining the difference.
    composeAgentSession(
      `${tAgent("launchPrompt.head", { identifier, title: issue.title })}\n\n${tAgent(`launchPrompt.${agentLaunchPromptVariant(issue)}`)}`
    );
  };
  // A plan already exists → the “plan” entries (⋯ menu, copied prompt, agent)
  // switch from “generate” to “verify”.
  const issueHasPlan = hasPlanTasks(issue.plan);
  // “Generate a plan” / “Verify the plan”: a new session whose prompt is to
  // FRAME the ticket — write the plan if it has none, review it point by point
  // if it already has one, then stop before implementing. `intent:
  // "plan"`: the ticket does not go "in progress", framing is not starting.
  const writePlanWithAgent = () => {
    composeAgentSession(
      `${tAgent("launchPrompt.head", { identifier, title: issue.title })}\n\n${tAgent(`launchPrompt.${agentPlanPromptVariant(issue)}`)}`,
      "plan"
    );
  };
  // “Check implementation”: new session that rereads the work ALREADY done
  // facing the plan and the ticket comments, then fixes the proven bugs.
  // `intent: "verify"`: the ticket does not move — check the work done
  // is not the start, and a review ticket must remain there.
  const verifyWithAgent = () => {
    composeAgentSession(
      `${tAgent("launchPrompt.head", { identifier, title: issue.title })}\n\n${tAgent("launchPrompt.verifyImplementation")}`,
      "verify"
    );
  };
  // ⇧A: ticket already with a session → we open it; otherwise we start a new one.
  // Plan without agents (MIN-72): the shortcut is inert, the menu entries absent.
  const launchAgent = () => {
    if (!agentsEnabled) return;
    if (agentHasSession) openAgentSession();
    else startNewAgentSession();
  };

  // Picker candidates: the other OPEN issues of the project, excluding those
  // already linked — linking to completed/canceled work makes no sense (a blocker
  // clos ne bloque plus).
  const relationCandidates = useMemo(() => {
    if (!candidateIssues) return [];
    const linked = new Set((relations ?? []).map((r) => r.otherId));
    return candidateIssues.filter(
      (i) => i.id !== issue.id && !linked.has(i.id) && !isClosedStatus(i.status)
    );
  }, [candidateIssues, relations, issue.id]);
  // Context common to the two copyable prompts (implement the ticket, write
  // its plan): relations and categories, resolved into readable names.
  const promptContext = () => {
    // Relationships of the issue (type + identifier + title of the other issue) — the
    // title is resolved from candidateIssues (the complete list of the project),
    // which only exists in the authenticated app: no leak on the public board side.
    const titleById = new Map((candidateIssues ?? []).map((i) => [i.id, i.title]));
    return {
      relations: (relations ?? []).map((r) => ({
        type: r.relation,
        identifier: issueIdentifier(projectKey, r.otherNumber),
        title: titleById.get(r.otherId) ?? "",
      })),
      // Category names (IDs live on the issue, names in categoryMap).
      categories: issue.category_ids
        .map((cid) => categoryMap.get(cid)?.name)
        .filter((name): name is string => !!name),
    };
  };

  const copyPrompt = async () => {
    // Copying a prompt means entrusting the work to someone else: the channel
    // who was waiting for this suspended ticket is canceled (MIN-147). In the callback and
    // not in the menu — ⇧P calls it directly.
    handOffIssueApi(issue.id);
    // MIN-20: copy the prompt starts the ticket (option enabled by default,
    // can be deactivated in Account → Preferences). We only advance the statutes
    // pre-work, and the toast only signals the trip if it has taken place.
    const autoStart =
      resolvePromptCopyAutoStart(user?.user_metadata) &&
      shouldAutoStartOnPromptCopy(issue.status);
    // The copied XML must reflect the REAL state after movement: if we pass the
    // “In progress” ticket, the prompt already describes it `in_progress`, not the old one.
    const promptIssue = autoStart
      ? { ...issue, status: "in_progress" as const }
      : issue;
    const prompt = buildIssuePrompt({
      issue: promptIssue,
      projectId,
      projectKey,
      resourceCount: issue.resource_count,
      ...promptContext(),
    });
    await navigator.clipboard.writeText(prompt);
    if (autoStart) {
      onUpdateIssue(issue.id, { status: "in_progress" });
      toast.success(t("promptCopiedMoved"));
    } else {
      toast.success(t("promptCopied"));
    }
  };

  // “Generate a plan” / “Check the plan” on the prompt side: the instruction
  // framing, for an external agent — `buildIssuePlanPrompt` switches alone to the
  // rereading when the plan exists. No automatic start: schedule
  // is not starting.
  const copyPlanPrompt = async () => {
    // Getting started: the suspended chain is canceled (MIN-147).
    handOffIssueApi(issue.id);
    await navigator.clipboard.writeText(
      buildIssuePlanPrompt({
        issue,
        projectId,
        projectKey,
        resourceCount: issue.resource_count,
        ...promptContext(),
      })
    );
    toast.success(
      tPlan(issueHasPlan ? "reviewPromptCopied" : "planPromptCopied")
    );
  };

  // “Check implementation” prompt side copied. No start
  // automatic: we reread work already done, we don’t start it — and a
  // Ticket remaining upstream must not advance because a check is requested.
  const copyVerifyPrompt = async () => {
    // Getting started: the suspended chain is canceled (MIN-147).
    handOffIssueApi(issue.id);
    await navigator.clipboard.writeText(
      buildIssueVerifyPrompt({
        issue,
        projectId,
        projectKey,
        resourceCount: issue.resource_count,
        ...promptContext(),
      })
    );
    toast.success(t("verifyPromptCopied"));
  };

  // “Customized”: the instruction entered in the dialog replaces the instruction
  // ready made — the context of the ticket remains provided by minddy (block
  // <issue> of the copied prompt; session context on the Numo agent side). None
  // automatic start: we do not know if this instruction is work.
  const runCustomPrompt = async (
    instructions: string,
    target: CustomPromptTarget
  ) => {
    if (target === "launch") {
      composeAgentSession(
        `${tAgent("launchPrompt.head", { identifier, title: issue.title })}\n\n${instructions}`,
        "custom"
      );
      return;
    }
    await navigator.clipboard.writeText(
      buildIssueCustomPrompt(
        {
          issue,
          projectId,
          projectKey,
          resourceCount: issue.resource_count,
          ...promptContext(),
        },
        instructions
      )
    );
    toast.success(t("promptCopied"));
  };

  // ⚠ STABLE envelopes, not the handlers themselves (MIN-316).
  //
  // `useAgentMenuActions` has its eleven parameters as dependencies of its `useMemo`.
  // The handlers above are made in the component body: passed
  // as is, the memo never got right and remanufactured ~20 objects
  // action and ~16 JSX icons per card per render — for a CLOSED menu.
  // `useStableCallback` freezes their identity without freezing what they do.
  const agentActions = useAgentMenuActions({
    agentsEnabled,
    hasSession: agentHasSession,
    hasPlan: issueHasPlan,
    onCopyPrompt: useStableCallback(() => void copyPrompt()),
    onCopyPlanPrompt: useStableCallback(() => void copyPlanPrompt()),
    onCopyVerifyPrompt: useStableCallback(() => void copyVerifyPrompt()),
    onCopyCustomPrompt: useStableCallback(() => setCustomTarget("copy")),
    onImplementWithAgent: useStableCallback(() => startNewAgentSession()),
    onWritePlanWithAgent: useStableCallback(() => writePlanWithAgent()),
    onVerifyWithAgent: useStableCallback(() => verifyWithAgent()),
    onCustomWithAgent: useStableCallback(() => setCustomTarget("launch")),
    onOpenSession: useStableCallback(() => openAgentSession()),
  });

  // Keyboard shortcuts on hover: S/P/E/A/L/D/O open the picker on cursor,
  // Space opens the ticket (like a click), Shift+P copies the prompt, Shift+A
  // opens the agent (the last conversation of the ticket, or a blank dialer).
  // The “Custom” dialog suspends them: it covers the card, and a key
  // hit in there should not open a picker on the ticket below.
  const { containerProps, menuState, openField, closeMenu } =
    useIssueFieldShortcuts(!isDragging && !customTarget, {
      " ": openIssue,
      "shift+p": () => void copyPrompt(),
      "shift+a": launchAgent,
    });
  const { ref: shortcutsRef, ...hoverProps } = containerProps;

  // Opens the picker of a field at the point of the last right click — where the menu
  // who just proposed it was displayed, as for the relationship picker.
  const openFieldAtPointer = (field: ShortcutField) => {
    const at = pointerRef.current;
    if (at) openField(field, at);
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    try {
      await onDelete(issue.id);
      toast.success(t("issueDeletedToast"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // “@” (MIN-105): the card registers with the board, which listens to the key
  // and finds at the time of typing the one which is under the pointer.
  const askNumoRef = useAskNumoTarget(issue);

  // dnd-kit, field shortcuts and '@' all three want the div
  // root. Merger memorized (the three refs are stable): a new
  // identity with each rendering would cause the three to be detached and then reattached. Do nothing
  // return, so that React stays on the `null` callback on unmount.
  const setCardRef = useCallback(
    (el: HTMLDivElement | null) => {
      setNodeRef(el);
      shortcutsRef(el);
      askNumoRef(el);
    },
    [setNodeRef, shortcutsRef, askNumoRef]
  );

  /**
   * The right-click menu, builds ONLY when it opens (MIN-316).
   *
   * It costs around twenty action items, as many JSX icons and one
   * dozen translation calls — by card, and it was redone each time
   * rendering of each card on the board, while a closed menu renders nothing at all
   * (`IssueContextMenu` exits on `position === null`).
   */
  const lastMenuActions = useRef<ContextMenuAction[]>(NO_ACTIONS);
  const menuActions = useMemo<ContextMenuAction[]>(() => {
    // ⚠ Closed, we return the LAST constructed list, not an empty array.
    // `IssueContextMenu` does not unmount its contents when closed — Radix
    // keeps mounted for the duration of its exit animation (`data-closed:animate-out`
    // in mango-ui) —, so emptying it here would empty the ON-SCREEN menu before
    // that it does not disappear. Before the first opening, the list is empty and
    // nothing has ever been returned: that’s where the economy happens.
    if (!menuPosition) return lastMenuActions.current;
    return [
    // Prompt and agent: two submenus “Generate a plan” / “Implement the
    // ticket”, shared with the side panel. The code officer is working on
    // the Agents PAGE; ⇧P and ⇧A remain on the “implement” branch.
    ...agentActions,
    // Open pull request — only offered when a PR exists for the ticket.
    ...(agentsEnabled && pr && openPr
      ? [
          {
            id: "open-pr",
            label: tAgent("viewPullRequest"),
            keywords: ["pull request", "pr", "review", "github", "gitlab", "merge"],
            icon: <GitPullRequest className="size-4" />,
            onSelect: openPr,
          },
        ]
      : []),
    // Relations (MIN-25 / MIN-30): grouped under a "Relations" submenu. Each
    // leaf opens the target-issue picker at the pointer. Shown only when the
    // board wired the relation handlers.
    ...(onAddRelation
      ? [
          {
            id: "relations",
            label: tRel("relations"),
            keywords: ["relation", "link", "lier", "bloc", "block"],
            icon: <Link2 className="size-4" />,
            children: RELATION_TYPES.map((type) => ({
              id: `relation-${type}`,
              label: tRel(`action_${type}`),
              keywords: [tRel(type), "relation", "link", "lier"],
              icon: <RelationIcon relation={type} className="size-4" />,
              onSelect: () => setRelationType(type),
            })),
          },
        ]
      : []),
    // Goal and deadline are ONLY displayed on the map when they are
    // placed: without them, the card offers no socket for placing them. The menu
    // then reopens the picker at the pointer — exactly what O and D do.
    ...(!issue.objective_id && objectiveMap && objectiveMap.size > 0
      ? [
          {
            id: "set-objective",
            label: t("actionLinkObjective"),
            keywords: ["objectif", "objective", "goal", "lier", "link"],
            icon: <Target className="size-4" />,
            shortcut: KEY_FOR_FIELD.objective,
            onSelect: () => openFieldAtPointer("objective"),
          },
        ]
      : []),
    ...(!issue.due_date
      ? [
          {
            id: "set-due-date",
            label: t("actionSetDueDate"),
            keywords: [
              "échéance",
              "echeance",
              "date",
              "due",
              "deadline",
              "calendrier",
              "calendar",
            ],
            icon: <Calendar className="size-4" />,
            shortcut: KEY_FOR_FIELD.dueDate,
            onSelect: () => openFieldAtPointer("dueDate"),
          },
        ]
      : []),
      ...(buildMenuActions?.(issue) ?? []),
    ...(onDelete
      ? [
          {
            id: "delete",
            label: tCommon("moveToTrash"),
            keywords: [
              "corbeille",
              "trash",
              "supprimer",
              "delete",
              "remove",
              "archiver",
            ],
            icon: <Trash2 className="size-4" />,
            separatorBefore: true,
            variant: "destructive" as const,
            onSelect: () => setConfirmDelete(true),
          },
        ]
        : []),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    menuPosition,
    agentActions,
    agentsEnabled,
    pr,
    openPr,
    onAddRelation,
    issue,
    objectiveMap,
    buildMenuActions,
    onDelete,
    t,
    tAgent,
    tRel,
    tCommon,
  ]);
  lastMenuActions.current = menuActions;

  return (
    <div
      ref={setCardRef}
      // What the board lasso looks for in the DOM, and what it avoids like
      // starting point — a card is not from the background (see marquee-selection).
      data-issue-id={issue.id}
      {...attributes}
      {...listeners}
      {...hoverProps}
      onClick={(e) => {
        if (e.shiftKey && onSelect) {
          e.preventDefault();
          e.stopPropagation();
          onSelect(issue.id);
          return;
        }
        openIssue();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        pointerRef.current = { x: e.clientX, y: e.clientY };
        setMenuPosition(pointerRef.current);
      }}
      {...drop.handlers}
      // No touch-action override: drag-and-drop is mouse-only (MouseSensor), so
      // touch is free to scroll the board/columns natively.
      className={cn(
        "relative cursor-pointer rounded-xl",
        (isDragging || dragging) && "opacity-40",
      )}
    >
      <DropOverlay
        show={drop.dragging}
        label={tAttach("dropOnIssue", { id: identifier })}
      />
      {/* Upload dropped on the card still in flight — discreet corner spinner. */}
      {!drop.dragging && uploads.pending.length > 0 && (
        <span className="absolute right-2 top-2 z-10 flex size-5 items-center justify-center rounded-full border border-border bg-card shadow-sm">
          <Spinner className="size-3" />
        </span>
      )}
      {(() => {
        const body = (
          <IssueCardBody
            issue={issue}
            projectKey={projectKey}
            project={project}
            memberMap={memberMap}
            categoryMap={categoryMap}
            objectiveMap={objectiveMap}
            parentNumber={parent?.number}
            relations={relations}
            onOpenParent={openParent}
            onOpenRelated={onOpenRelated}
            onOpenPlan={openPlan}
            pr={pr}
            onOpenPr={openPr}
            onUpdate={(patch) => onUpdateIssue(issue.id, patch)}
            onSetCategories={(ids) => onSetCategories(issue.id, ids)}
            inCurrentCycle={inCurrentCycle}
            selected={selected}
          />
        );
        // Current agent: animated border that runs along the edge (wrapper `AgentBeam`
        // sharing). The wrapper has `overflow: hidden` → we transfer the shadow of
        // the card, which he would otherwise trim. To be kept aligned with that of the body.
        //
        // `keepMounted` is NOT decorative here (MIN-302): without it, the type of
        // the element rendered at this position changes with `agentActive`, and React
        // does not reconcile two different types — it unmounts the subtree and
        // get a new one. Now this subtree is the entire body of the map and
        // its six pickers: at each shift of the halo, their local states
        // die, an open picker clears without exit animation, and the
        // focus falls back to <body>.
        return (
          <AgentBeam
            active={agentActive}
            keepMounted
            className="rounded-xl shadow-xs"
          >
            {body}
          </AgentBeam>
        );
      })()}
      <IssueContextMenu
        position={menuPosition}
        onClose={() => setMenuPosition(null)}
        actions={menuActions}
      />
      <RelationTargetPicker
        position={relationType ? pointerRef.current : null}
        relation={relationType}
        issues={relationCandidates}
        projectKey={projectKey}
        onClose={() => setRelationType(null)}
        onSelect={(targetId) => {
          if (relationType) onAddRelation?.(issue.id, relationType, targetId);
          setRelationType(null);
        }}
      />
      <CustomPromptDialog
        target={customTarget}
        onOpenChange={(open) => !open && setCustomTarget(null)}
        onSubmit={(instructions, target) => {
          void runCustomPrompt(instructions, target);
        }}
      />
      {/* Portalized too, therefore rendered in the React tree of the map: the
          wrapper stops events which, without it, would go back to the
          click (open the ticket) and the drag sensor. */}
      <div onClick={stop} onMouseDown={stop} onContextMenu={stop}>
        <ConfirmDeleteDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={t("deleteDialogTitle")}
          description={t("deleteDialogDescription", {
            days: TRASH_RETENTION_DAYS,
          })}
          confirmLabel={tCommon("moveToTrash")}
          cancelLabel={tCommon("cancel")}
          onConfirm={handleDelete}
        />
      </div>
      <IssueShortcutMenu
        state={menuState}
        onClose={closeMenu}
        issue={issue}
        members={cardMemberList}
        categories={cardCategoryList}
        objectives={cardObjectiveList}
        onUpdate={(patch) => onUpdateIssue(issue.id, patch)}
        onSetCategories={(ids) => onSetCategories(issue.id, ids)}
      />
    </div>
  );
});
