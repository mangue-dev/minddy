"use client";

import { objectiveHref, pullRequestHref } from "@/lib/app-urls";
import { prefetchDescriptionSnapshot } from "@/lib/description-collaboration";
import { HugeiconsIcon } from "@hugeicons/react";
import { HierarchySquare01Icon, TriangleIcon } from "@hugeicons/core-free-icons";
import {
  memo,
  useCallback,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { useDraggable } from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useIssueMenuActionsWithNavigation, type IssueMenuSelection } from "@/components/use-issue-menu-actions";
import { useProjectCapabilities } from "@/lib/use-project-capabilities";
import { useAgentMenuActions } from "@/components/agent/use-agent-menu-actions";
import { CustomPromptDialog } from "@/components/agent/custom-prompt-dialog";
import {
  ALL_STATUSES,
  PRIORITIES,
  EFFORT_MAP,
  EFFORTS,
  issueIdentifier,
  type IssueStatus,
  type IssuePriority,
  type IssueEffort,
} from "@/lib/issue-constants";
import { displayName } from "@/lib/display-name";
import { UserAvatar } from "@/components/user-avatar";
import {
  StatusIndicator,
  PriorityIndicator,
} from "@/components/issue-indicators";
import { RelationChips, type ChipRelation } from "@/components/relation-chips";
import { RelationPalettePicker } from "@/components/palette-picker-rows";
import {
  HIERARCHY_RELATIONS,
  hierarchyAvailable,
  hierarchyCandidates,
  hierarchyPatches,
  isHierarchyRelation,
  type RelationMenuKind,
} from "@/lib/issue-hierarchy";
import { LinkablePullRequestsProbe, PullRequestPalettePicker } from "@/components/pull-requests/pr-link-target-picker";
import { useLinkIssuesToPullRequest } from "@/lib/use-link-issues-to-pull-request";
import type { RelationKinds } from "@/lib/use-issue-relations-query";
import { useIssueSelection } from "@/lib/issue-selection-context";
import { closedObjectivesLast } from "@/lib/relation-constants";
import { useUndoHistory } from "@/lib/undo/undo-context";
import {
  hasDirectRelation,
  shortcutTargets,
  type ShortcutTargetField,
} from "@/lib/issue-shortcut-targets";
import { useIssuePr, useIssuePrReadiness, useIssuePrStore } from "@/components/issue-pr-context";
import { bulkPullRequestLinks } from "@/lib/bulk-pull-request-links";
import { PrReadinessIcon } from "@/components/pull-requests/pr-readiness";
import { PullRequestHoverCard } from "@/components/pull-requests/pr-hover-card";
import type { IssuePrReadiness } from "@/lib/issue-pr-store";
import { SMART_ASSIGN_ICON } from "@/components/feature-icons";
import { useSmartAssignFillsEmpty } from "@/lib/use-smart-assign-empty";
import {
  isPrWorthShowing,
  type IssuePr,
} from "@/lib/agent-api";
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
  RELATION_SHORTCUT_KEY,
  RelationTypePicker,
  useIssueFieldShortcuts,
  type ShortcutField,
} from "@/components/issue-field-shortcuts";
import {
  buildIssueCommentsPrompt,
  buildIssueCustomPrompt,
  buildIssuePlanPrompt,
  buildIssuePrompt,
  buildIssueVerifyPrompt,
} from "@/lib/issue-prompt";
import {
  loadOneIssuePromptContext,
  prefetchIssuePromptContext,
} from "@/lib/issue-prompt-context";
import { useAskNumoTarget } from "@/lib/ask-numo-context";
import type { CommentFollowUp } from "@/lib/comment-follow-up";
import { useCommentFollowUp } from "@/lib/use-comment-follow-ups";
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
import { parseDueDate } from "@/lib/due-date";
import type { RecurrenceCadence } from "@/lib/recurrence";
import { TRASH_RETENTION_DAYS } from "@/lib/trash-retention";
import { hasPlanTasks, planProgress, type PlanProgress } from "@/lib/plan";
import { commentTarget, requestCommentFocus } from "@/lib/comment-focus";
import { OBJECTIVE_PILL_TRIGGER, ObjectivePill } from "@/components/objective-label";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { MentionHover } from "@/components/mention-hover";
import {
  COMMENT_FOLLOW_UP_CLASS,
  IssueCardAssigneeAvatar,
  IssueCardCategories,
  IssueCardCommentFollowUp,
  IssueCardCommentFollowUpContent,
  IssueCardDueDate,
  IssueCardEffort,
  IssueCardFace,
  IssueCardObjectiveDisplay,
  IssueCardPlanContent,
  IssueCardPriority,
  IssueCardPullRequestContent,
  IssueCardStatus,
  pullRequestChip,
} from "@/components/issue-card-face";
import { useIssueCardRichSlots } from "@/components/issue-card-rich-slots";

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

/** The look of a hovered card. The drag overlay is a copy of the card taken
 * at rest (lib/board-dnd.ts), so the same look, plus a light lift, comes from
 * the `data-held` mark the copy carries rather than from `:hover`. */
// The tint also stays while one of the card's menus or pickers is open
// (`data-menu-open`, or a pill whose picker is open), pointer on it or not:
// the card reads as the one the open surface acts on.
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
  if (!onChange) return <IssueCardStatus value={value} />;
  const options: PickerOption[] = ALL_STATUSES.map((s) => ({
    value: s.value,
    label: tStatus(s.value),
    icon: <StatusIndicator status={s.value} className="size-4" />,
  }));
  return (
    <SearchSelect
      deferTrigger
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
          aria-label={t("fieldValueAria", { field: tField("status"), value: tStatus(value) })}
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
  if (!onChange) return <IssueCardPriority value={value} />;
  const options: PickerOption[] = PRIORITIES.map((p) => ({
    value: p.value,
    label: tPriority(p.value),
    icon: <PriorityIndicator priority={p.value} className="size-4" />,
  }));
  return (
    <SearchSelect
      deferTrigger
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
          aria-label={t("fieldValueAria", { field: tField("priority"), value: tPriority(value) })}
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
  const display = <IssueCardEffort value={value} />;
  if (!onChange) return display;
  const options: PickerOption[] = EFFORTS.map((e) => ({
    value: e.value,
    label: e.label,
    icon: <HugeiconsIcon icon={TriangleIcon} className="size-4 text-muted-foreground" />,
  }));
  return (
    <SearchSelect
      deferTrigger
      value={value}
      onChange={(v) => onChange(v as IssueEffort | null)}
      options={options}
      noneOption={{ label: tField("effortNone") }}
      align="start"
      tooltip={tField("effort")}
      shortcutHint={KEY_FOR_FIELD.effort}
      stopPropagation
      trigger={
        <button
          type="button"
          aria-label={t("fieldValueAria", { field: tField("effort"), value: value ? EFFORT_MAP[value].label : tField("effortNone") })}
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
  const display = <IssueCardCategories categories={categories} selectedIds={selectedIds} />;
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
      deferTrigger
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
          aria-label={t("fieldValueAria", {
            field: tField("categories"),
            value: categories.filter((c) => selectedIds.includes(c.id)).map((c) => c.name).join(", ") || tField("noCategories"),
          })}
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
  projectId,
  status,
}: {
  assignee: Member | null;
  members: Member[];
  onChange?: (id: string | null) => void;
  projectId: string;
  status: string;
}) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  // The project's Smart Assign fills an empty assignee (MIN-811): the empty
  // state and the picker's clear option name it, as in the issue panel.
  const smartAssign = useSmartAssignFillsEmpty(projectId, status);
  const emptyLabel = tField(smartAssign ? "smartAssign" : "unassigned");
  const avatar = (
    <IssueCardAssigneeAvatar
      assignee={assignee}
      smartAssign={smartAssign}
      emptyLabel={emptyLabel}
      // The picker's own tooltip already names the field: a second, native
      // one with the person's name would stack on top of it.
      named={!onChange}
    />
  );
  if (!onChange) return avatar;
  const options: PickerOption[] = members.map((m) => ({
    value: m.user_id,
    label: displayName(m),
    keywords: m.email ? [m.email] : undefined,
    icon: <UserAvatar seed={m.avatar_seed} className="size-5" />,
  }));
  return (
    <SearchSelect
      deferTrigger
      value={assignee?.user_id ?? null}
      onChange={onChange}
      options={options}
      noneOption={{
        label: emptyLabel,
        icon: smartAssign ? (
          <HugeiconsIcon icon={SMART_ASSIGN_ICON} strokeWidth={1.75} className="size-[18px] shrink-0 text-muted-foreground" />
        ) : undefined,
      }}
      align="end"
      tooltip={tField("assignee")}
      shortcutHint={KEY_FOR_FIELD.assignee}
      stopPropagation
      trigger={
        <button
          type="button"
          aria-label={t("fieldValueAria", { field: tField("assignee"), value: assignee ? displayName(assignee) : emptyLabel })}
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
  const parsed = parseDueDate(value);
  if (!parsed) return null;

  // Read-only (e.g. inside the drag overlay): plain label, no picker.
  if (!onChange) return <IssueCardDueDate value={value} recurrence={recurrence} />;

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

/** The objective on the card's bottom line: the objective pill at its small
    size (MIN-785). With `onEdit`, a click opens the objective picker, as O
    does; without it the pill is read-only. */
// The pill is as tall as the avatar, so it is concentric with the card corner too.
function ObjectiveIndicator({ objective, onEdit }: {
  objective: IssueCardObjective;
  onEdit?: (at: { x: number; y: number }) => void;
}) {
  const tField = useTranslations("Field");
  const t = useTranslations("IssueUI");
  // The card's compact line keeps its small text, at the avatar's height,
  // and names the objective alone: no status glyph there.
  if (!onEdit) return <IssueCardObjectiveDisplay objective={objective} />;
  // Editable: the tooltip names the field and its O shortcut, like the
  // other property pickers of the card.
  return (
    <AppTooltip label={tField("objective")} shortcut={[KEY_FOR_FIELD.objective]}>
      <button
        type="button"
        aria-label={t("fieldValueAria", { field: tField("objective"), value: objective.name })}
        className={OBJECTIVE_PILL_TRIGGER}
        onClick={(event) => {
          event.stopPropagation();
          // The picker opens under the pill, where the click landed.
          const rect = event.currentTarget.getBoundingClientRect();
          onEdit({ x: rect.left, y: rect.bottom + 4 });
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <ObjectivePill
          objective={{ name: objective.name, color: objective.color }}
          size="sm"
          className="h-6"
        />
      </button>
    </AppTooltip>
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
  const content = <IssueCardPlanContent progress={progress} />;
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

/**
 * New comments the ticket's MCP agent has not answered (MIN-801): the count,
 * and a click copies the prompt that asks the agent to address them.
 */
function CommentFollowUpPick({
  followUp,
  onCopy,
}: {
  followUp: CommentFollowUp;
  onCopy?: () => void;
}) {
  const t = useTranslations("IssueUI");
  const label = t("commentsPendingLabel", { count: followUp.count });
  if (!onCopy) return <IssueCardCommentFollowUp followUp={followUp} />;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={t("commentsPromptAction")}
          onClick={(e) => {
            stop(e);
            onCopy();
          }}
          onPointerDown={stop}
          className={cn(COMMENT_FOLLOW_UP_CLASS, "outline-none transition-colors hover:bg-muted focus-visible:bg-muted")}
        >
          <IssueCardCommentFollowUpContent count={followUp.count} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{`${label} · ${t("commentsPromptAction")}`}</TooltipContent>
    </Tooltip>
  );
}

/** Opens a card's menu from its focus stop, at the card's top-left corner. */
function openCardMenuFromKeyboard(focusStop: HTMLElement) {
  const surface = focusStop.firstElementChild;
  if (!(surface instanceof HTMLElement)) return;
  const rect = surface.getBoundingClientRect();
  surface.dispatchEvent(new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: rect.left + 16,
    clientY: rect.top + 16,
  }));
}

/** The pull request in the card header, in place of the plan. Clicking opens
    its review; hovering shows where it stands (MIN-888). Read-only (a span
    without a handler) in the drag overlay / public board.

    The colors are GitHub's, as everywhere else: GREEN when open,
    PURPLE when merged, NEUTRAL when the PR is still a draft. The color and
    icon already say the state, so the chip shows the PR's number (MIN-735);
    the state words stay in the hover card and for screen readers. */
function PrPick({
  pr,
  readiness,
  onOpen,
}: {
  pr: IssuePr;
  readiness?: IssuePrReadiness | null;
  onOpen?: () => void;
}) {
  const t = useTranslations("Agent");
  const { label: stateLabel, tone, hover } = pullRequestChip(pr.state, t);
  const content = <IssueCardPullRequestContent state={pr.state} number={pr.prNumber} />;
  if (!onOpen) {
    return (
      <span className={cn("flex items-center gap-1 text-[11px] font-medium", tone)}>
        {content}
      </span>
    );
  }
  return (
    <PullRequestHoverCard pr={pr} readiness={readiness} onOpen={onOpen}>
      <button
        type="button"
        aria-label={`${t("viewPullRequest")} #${pr.prNumber}, ${stateLabel}`}
        onClick={(e) => {
          stop(e);
          onOpen();
        }}
        onPointerDown={stop}
        className={cn(
          "flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-medium outline-none transition-colors",
          tone,
          hover,
        )}
      >
        {content}
      </button>
    </PullRequestHoverCard>
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
  parentId,
  relations,
  onOpenParent,
  onOpenRelated,
  onRemoveRelation,
  onOpenPlan,
  onUpdate,
  onSetCategories,
  inCurrentCycle,
  selected,
  menuOpen,
  pr,
  prReadiness,
  onOpenPr,
  onOpenObjective,
  onEditObjective,
  commentFollowUp,
  onCopyCommentsPrompt,
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
  /** Parent issue's number — when set, the card is a sub-issue and shows
      a hierarchy icon before its own identifier. */
  parentNumber?: number;
  /** Parent issue's id: its card shows on hover over the hierarchy icon. */
  parentId?: string;
  /** This issue's relations (blocks/blocked-by/related), pre-sorted by priority —
      the highest-signal one shows as a chip after the identifier. */
  relations?: ChipRelation[];
  /** Opens the parent's side panel (clicking the hierarchy icon). */
  onOpenParent?: () => void;
  /** Opens a related objective through the owning board's navigation action. */
  onOpenObjective?: (objectiveId: string) => void;
  /** Opens the objective picker at a point (clicking the objective pill). */
  onEditObjective?: (at: { x: number; y: number }) => void;
  /** Opens a related issue's side panel (clicking a relation chip). */
  onOpenRelated?: (issueId: string) => void;
  /** Removes a relation from the relation popover (absent → no remove button). */
  onRemoveRelation?: (relationId: string) => void;
  /** Opens this issue's side panel on the plan tab (clicking the plan indicator). */
  onOpenPlan?: () => void;
  /** The ticket's PR, in any state. The “PR available” chip is shown
      (IN PLACE of the plan) only if it still calls for action — a
      REJECTED PR calls for nothing, and hiding the plan's progress for it would
      lose useful information. The menu still leads to it in every state. */
  pr?: IssuePr | null;
  /** Merge readiness of a live PR, shown next to its number like the Code
      review rows; absent on surfaces without the board's PR provider. */
  prReadiness?: IssuePrReadiness | null;
  /** Opens the pull request review (clicking the “PR available” chip). */
  onOpenPr?: () => void;
  /** Comments written since the ticket's MCP agent last commented (MIN-801);
      absent on surfaces that do not read them. */
  commentFollowUp?: CommentFollowUp | null;
  /** Copies the prompt for those comments (clicking their indicator). */
  onCopyCommentsPrompt?: () => void;
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
  /** A menu or picker of this card is open: the card keeps its hover tint. */
  menuOpen?: boolean;
}) {
  const t = useTranslations("IssueUI");
  const plan = planProgress(issue.plan);
  const assignee = issue.assignee_id
    ? (memberMap.get(issue.assignee_id) ?? null)
    : null;
  const objective =
    issue.objective_id && objectiveMap
      ? (objectiveMap.get(issue.objective_id) ?? null)
      : null;
  // Picker lists are memoized (MIN-316): `[...map.values()]` is a new array on
  // every render, which creates new `options` for every picker and rebuilds all
  // their JSX icons — even for CLOSED menus.
  const memberList = useMemo(() => [...memberMap.values()], [memberMap]);
  const categoryList = useMemo(() => [...categoryMap.values()], [categoryMap]);
  const rich = useIssueCardRichSlots(issue);

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
    ? (next: {
        due_date: string | null;
        recurrence: RecurrenceCadence | null;
      }) => onUpdate(next)
    : undefined;

  return (
    <IssueCardFace
      issue={issue}
      projectKey={projectKey}
      project={project}
      memberMap={memberMap}
      categoryMap={categoryMap}
      objectiveMap={objectiveMap}
      parentNumber={parentNumber}
      relations={relations}
      inCurrentCycle={inCurrentCycle}
      pr={pr}
      selected={selected}
      menuOpen={menuOpen}
      commentFollowUp={commentFollowUp}
      slots={{
        ...rich,
        parent: parentNumber != null && (
          // The parent's card on hover (MIN-879); the label keeps naming it.
          <MentionHover type={parentId ? "issue" : "none"} id={parentId ?? ""}
            project={issue.project_id} onOpen={onOpenParent}>
            <button type="button" disabled={!onOpenParent}
              onClick={(e) => { stop(e); onOpenParent?.(); }} onPointerDown={stop}
              aria-label={t("openParentAria", { id: issueIdentifier(projectKey, parentNumber) })}
              className="shrink-0 rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <HugeiconsIcon icon={HierarchySquare01Icon} className="size-3" aria-hidden />
            </button>
          </MentionHover>
        ),
        relations: relations && relations.length > 0 && (
          <RelationChips
            relations={relations}
            projectKey={projectKey}
            onOpen={onOpenRelated}
            onOpenObjective={onOpenObjective}
            onRemove={onRemoveRelation}
            className="shrink-0"
          />
        ),
        commentFollowUp: commentFollowUp && (
          <CommentFollowUpPick followUp={commentFollowUp} onCopy={onCopyCommentsPrompt} />
        ),
        // An actionable PR takes the place of plan progress.
        activity: pr && isPrWorthShowing(pr) ? (
          <span className="flex items-center gap-0.5">
            <PrPick pr={pr} readiness={prReadiness} onOpen={onOpenPr} />
            {prReadiness && pr.state === "open" ? (
              <PrReadinessIcon readiness={prReadiness.readiness} unavailable={prReadiness.unavailable}
                autoMerge={!!prReadiness.flow?.active} />
            ) : null}
          </span>
        ) : plan.total > 0 ? (
          <PlanPick progress={plan} onOpen={onOpenPlan} />
        ) : null,
        assignee: (
          <AssigneePick
            assignee={assignee}
            members={memberList}
            onChange={setAssignee}
            projectId={issue.project_id}
            status={issue.status}
          />
        ),
        status: <StatusPick value={issue.status} onChange={setStatus} />,
        priority: <PriorityPick value={issue.priority} onChange={setPriority} />,
        effort: <EffortPick value={issue.effort} onChange={setEffort} />,
        categories: (
          <CategoryPick
            categories={categoryList}
            selectedIds={issue.category_ids}
            onChange={onSetCategories}
            projectId={issue.project_id}
          />
        ),
        objective: objective && <ObjectiveIndicator objective={objective} onEdit={onEditObjective} />,
        dueDate: issue.due_date && (
          <DueDatePick
            value={issue.due_date}
            onChange={setDueDate}
            recurrence={issue.recurrence}
            onRecurrenceChange={setRecurrence}
          />
        ),
      }}
    />
  );
});

const IssueCardContent = memo(function IssueCardContent({
  issue,
  projectId,
  projectKey,
  project,
  memberMap,
  categoryMap,
  objectiveMap,
  parent,
  relations,
  getCandidateIssues,
  onNavigate,
  onOpenIssue,
  onOpenRelated,
  onAddRelation,
  onRemoveRelation,
  onOpenPlan,
  onUpdateIssue,
  onSetCategories,
  onDelete,
  buildMenuActions,
  inCurrentCycle,
  selected,
  dragging,
  onSelect,
  onInteractionChange,
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
  /** Avoid passing a board-wide array through every card render. */
  getCandidateIssues?: () => Issue[] | undefined;
  onOpenRelated?: (issueId: string) => void;
  /** Adds a relation from this issue (source) to the picked target. When set,
      the right-click menu gains the three "mark as…" relation actions. */
  onAddRelation?: (
    sourceId: string,
    type: IssueRelationType,
    targetId: string,
    kinds?: RelationKinds,
  ) => void;
  /** Removes a relation from the card's relation popover. */
  onRemoveRelation?: (relationId: string) => void;
  onOpenPlan?: (issue: Issue) => void;
  /** Shared public router action; cards do not subscribe to route context. */
  onNavigate: (href: string) => void;
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
  /** A window retains card-owned dialogs, drafts and unfinished uploads. */
  onInteractionChange?: (issueId: string, open: boolean) => void;
}) {
  const t = useTranslations("IssueUI");
  const tAttach = useTranslations("Resources");
  const buildIssueMenuActions = useIssueMenuActionsWithNavigation(onNavigate);
  // Project readers (MIN-693): the card opens and navigates, nothing mutates.
  const { canWrite } = useProjectCapabilities(issue.project_id);
  const tPlan = useTranslations("Plan");
  const tCommon = useTranslations("Common");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // One issue-scoped subscription drives the pull request chip.
  const pr = useIssuePr(issue.id);
  const prReadiness = useIssuePrReadiness(issue.id);
  // One project-scoped request flags the tickets whose MCP agent has new
  // comments to answer (MIN-801); each card selects its own entry.
  const commentFollowUp = useCommentFollowUp(issue.project_id, issue.id);

  // Card bindings are made HERE rather than by the column (MIN-316).
  // The received props take the ticket as an argument and are therefore stable
  // between renders; these callbacks close over `issue` without breaking the
  // card's memoization.
  const openIssue = useCallback(() => onOpenIssue(issue), [onOpenIssue, issue]);

  const updateCard = useCallback(
    (patch: IssueUpdateInput) => onUpdateIssue(issue.id, patch),
    [onUpdateIssue, issue.id],
  );
  const setCardCategories = useCallback(
    (ids: string[]) => onSetCategories(issue.id, ids),
    [onSetCategories, issue.id],
  );

  // A picker opened on a SELECTED card writes to the whole selection (MIN-795);
  // see lib/issue-shortcut-targets.ts for the project scoping. The selection
  // is read when a picker opens or applies, so selecting never re-renders
  // the cards.
  const selection = useIssueSelection();
  // One picker choice on a selection is one gesture for ⌘Z.
  const { linked } = useUndoHistory();
  const targetsFor = (field: ShortcutTargetField) =>
    selected ? shortcutTargets(issue, selection.getSelectedIssues(), field) : [issue];

  // Apply the same memoization to the shortcut menu (MIN-316).
  const cardMemberList = useMemo(() => [...memberMap.values()], [memberMap]);
  const cardCategoryList = useMemo(
    () => [...categoryMap.values()],
    [categoryMap],
  );
  const cardObjectiveList = useMemo(
    () => (objectiveMap ? [...objectiveMap.values()] : []),
    [objectiveMap],
  );
  const openParent = useMemo(
    () => (parent ? () => onOpenIssue(parent) : undefined),
    [onOpenIssue, parent],
  );
  const openPlan = useMemo(
    () => (onOpenPlan ? () => onOpenPlan(issue) : undefined),
    [onOpenPlan, issue],
  );
  const openObjective = useCallback((id: string) => {
    onNavigate(objectiveHref(issue.project_id, id));
  }, [onNavigate, issue.project_id]);
  const openPr = useMemo(
    () => pr ? () => onNavigate(pullRequestHref(pr.prId)) : undefined,
    [pr, onNavigate],
  );

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
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  // Remembered position of the last right-click: the relation picker opens in
  // the same place as the menu that just closed.
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  // The pull request picker, in the ⌘K palette (MIN-844).
  const [linkPrOpen, setLinkPrOpen] = useState(false);
  // Whether the project has an open pull request to link to; read only while
  // the menu is open, null until known.
  const [hasLinkablePr, setHasLinkablePr] = useState<boolean | null>(null);
  const linkIssuesToPullRequest = useLinkIssuesToPullRequest();
  // Relation being added (type chosen) → the ⌘K palette lists its targets
  // (MIN-844). The type comes from the right-click Relations entry, or from
  // the dropdown that R opens on the hovered card (MIN-749).
  const [relationType, setRelationType] = useState<RelationMenuKind | null>(
    null,
  );
  const closeRelationPicker = () => setRelationType(null);
  // R on the hovered card: where its relation-type dropdown opens.
  const [relationTypeAt, setRelationTypeAt] = useState<{ x: number; y: number } | null>(null);
  // Confirmation before trash (the “Move to trash” entry).
  const [confirmDelete, setConfirmDelete] = useState(false);
  // “Custom”: the free-form prompt dialog that copies the external prompt.
  const [customPromptOpen, setCustomPromptOpen] = useState(false);
  // Whether the dialog's request covers the card or its selection (MIN-833).
  const [customPromptScope, setCustomPromptScope] = useState<"issue" | "selection">("issue");
  // A plan already exists → the “plan” entries (⋯ menu, copied prompt, agent)
  // switch from “generate” to “verify”.
  const issueHasPlan = hasPlanTasks(issue.plan);
  // Relations (R, right-click) follow the field pickers: a selected card adds
  // the relation from every selected ticket of its project.
  const relationTargets = () => targetsFor("relation");
  const relationsOf = (issueId: string) =>
    issueId === issue.id ? relations : selection.getRelations(issueId);
  const addRelationFromTargets = (
    type: IssueRelationType,
    targetId: string,
    kinds: RelationKinds,
  ) => {
    linked(() => {
      for (const target of relationTargets()) {
        if (target.id === targetId) continue;
        if (hasDirectRelation(relationsOf(target.id), type, targetId)) continue;
        onAddRelation?.(target.id, type, targetId, kinds);
      }
    });
  };
  // Parent / sub-issue entries (MIN-804) the targets may take, read from the
  // project's tickets when a menu opens.
  const hierarchyRelations = () => {
    const candidateIssues = getCandidateIssues?.();
    if (!candidateIssues) return [];
    const targets = relationTargets();
    return HIERARCHY_RELATIONS.filter((kind) => hierarchyAvailable(kind, targets, candidateIssues));
  };
  const setParentFromTargets = (kind: RelationMenuKind, targetId: string) => {
    if (!isHierarchyRelation(kind)) return;
    const patches = hierarchyPatches(kind, relationTargets(), targetId, getCandidateIssues?.() ?? []);
    linked(() => {
      for (const { issueId, parent_id } of patches) onUpdateIssue(issueId, { parent_id });
    });
  };
  const relationCandidates = useMemo(() => {
    const candidateIssues = relationType ? getCandidateIssues?.() : undefined;
    if (!relationType || !candidateIssues) return [];
    const targets = relationTargets();
    if (isHierarchyRelation(relationType)) {
      return hierarchyCandidates(relationType, targets, candidateIssues);
    }
    const targetIds = new Set(targets.map((target) => target.id));
    // A candidate stays offered while at least one target can still gain it.
    return candidateIssues.filter(
      (i) =>
        i.project_id === issue.project_id &&
        !targetIds.has(i.id) &&
        targets.some((target) => !hasDirectRelation(relationsOf(target.id), relationType, i.id)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the selection is read when the picker opens
  }, [getCandidateIssues, relationType, relations, issue.id, issue.project_id]);
  const relationObjectiveCandidates = useMemo(() => {
    if (!relationType || isHierarchyRelation(relationType) || !objectiveMap) return [];
    const targets = relationTargets();
    return closedObjectivesLast([...objectiveMap.values()].filter(
      (objective) =>
        objective.project_id === issue.project_id &&
        targets.some((target) => !hasDirectRelation(relationsOf(target.id), relationType, objective.id)),
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the selection is read when the picker opens
  }, [objectiveMap, relationType, relations, issue.project_id]);
  // Context common to the two copyable prompts (implement the ticket, write
  // its plan): relations and categories, resolved into readable names.
  const promptContext = () => {
    // Relationships of the issue (type + identifier + title of the other issue) — the
    // title is resolved from candidateIssues (the complete list of the project),
    // which only exists in the authenticated app: no leak on the public board side.
    const titleById = new Map(
      (getCandidateIssues?.() ?? []).map((i) => [i.id, i.title]),
    );
    return {
      relations: (relations ?? []).map((r) => ({
        type: r.relation,
        objective: r.otherType === "objective",
        identifier:
          r.otherType === "objective"
            ? ""
            : issueIdentifier(projectKey, r.otherNumber ?? 0),
        title:
          r.otherType === "objective"
            ? (objectiveMap?.get(r.otherId)?.name ?? r.otherName ?? "")
            : (titleById.get(r.otherId) ?? ""),
      })),
      // Category names (IDs live on the issue, names in categoryMap).
      // In the project's category order (MIN-760), which the map follows.
      categories: [...categoryMap]
        .filter(([id]) => issue.category_ids.includes(id))
        .map(([, category]) => category.name),
    };
  };

  const copyPrompt = async () => {
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
      ...(await loadOneIssuePromptContext(issue.id)),
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
    const forge = await loadOneIssuePromptContext(issue.id);
    await navigator.clipboard.writeText(
      buildIssuePlanPrompt({
        issue,
        projectId,
        projectKey,
        resourceCount: issue.resource_count,
        ...promptContext(),
        ...forge,
      }),
    );
    toast.success(
      tPlan(issueHasPlan ? "reviewPromptCopied" : "planPromptCopied"),
    );
  };

  // “Check implementation” prompt side copied. No start
  // automatic: we reread work already done, we don’t start it — and a
  // Ticket remaining upstream must not advance because a check is requested.
  const copyVerifyPrompt = async () => {
    const forge = await loadOneIssuePromptContext(issue.id);
    await navigator.clipboard.writeText(
      buildIssueVerifyPrompt({
        issue,
        projectId,
        projectKey,
        resourceCount: issue.resource_count,
        ...promptContext(),
        ...forge,
      }),
    );
    toast.success(t("verifyPromptCopied"));
  };

  // “Custom”: the instruction entered in the dialog replaces the instruction
  // ready made — the context of the ticket remains provided by minddy (block
  // <issue> of the copied prompt). No automatic start: we do not know if this
  // instruction is work.
  const runCustomPrompt = async (instructions: string) => {
    const forge = await loadOneIssuePromptContext(issue.id);
    await navigator.clipboard.writeText(
      buildIssueCustomPrompt(
        {
          issue,
          projectId,
          projectKey,
          resourceCount: issue.resource_count,
          ...promptContext(),
          ...forge,
        },
        instructions,
      ),
    );
    toast.success(t("promptCopied"));
  };

  // “Copy prompt for new comments” (MIN-801): from the card's indicator or
  // its menu, without opening the ticket. No automatic start.
  const copyCommentsPrompt = async () => {
    if (!commentFollowUp) return;
    const forge = await loadOneIssuePromptContext(issue.id);
    await navigator.clipboard.writeText(
      buildIssueCommentsPrompt(
        {
          issue,
          projectId,
          projectKey,
          resourceCount: issue.resource_count,
          ...promptContext(),
          ...forge,
        },
        commentFollowUp,
      ),
    );
    toast.success(t("commentsPromptCopied"));
  };
  const copyCommentsPromptStable = useStableCallback(() => void copyCommentsPrompt());

  // ⚠ STABLE envelopes, not the handlers themselves (MIN-316).
  //
  // `useAgentMenuActions` has its parameters as dependencies of its `useMemo`.
  // The handlers above are made in the component body: passed as is, the memo
  // never held and remade the action objects and JSX icons per card per render
  // — for a CLOSED menu. `useStableCallback` freezes their identity without
  // freezing what they do.
  const agentActions = useAgentMenuActions({
    hasPlan: issueHasPlan,
    onCopyPrompt: useStableCallback(() => void copyPrompt()),
    onCopyPlanPrompt: useStableCallback(() => void copyPlanPrompt()),
    onCopyVerifyPrompt: useStableCallback(() => void copyVerifyPrompt()),
    onCopyCustomPrompt: useStableCallback(() => {
      setCustomPromptScope("issue");
      setCustomPromptOpen(true);
    }),
    onCopyCommentsPrompt: commentFollowUp ? copyCommentsPromptStable : undefined,
  });

  // Keyboard shortcuts on hover: S/P/E/A/L/D/O open the picker on cursor,
  // Space opens the ticket (like a click), Shift+P copies the prompt, Shift+C
  // opens it with the comment field focused (MIN-803), R adds a relation
  // (type at the cursor, then the target picker at the same point).
  // The “Custom” dialog suspends them: it covers the card, and a key
  // hit in there should not open a picker on the ticket below.
  const { containerProps, menuState, openField, closeMenu } =
    useIssueFieldShortcuts(!dragging && !customPromptOpen && canWrite, {
      " ": openIssue,
      "shift+p": () => void copyPrompt(),
      "shift+c": () => {
        requestCommentFocus(commentTarget("issue", issue.id));
        openIssue();
      },
      ...(onAddRelation
        ? { [RELATION_SHORTCUT_KEY]: (at: { x: number; y: number } | null) => at && setRelationTypeAt(at) }
        : {}),
    });
  const { ref: shortcutsRef, ...hoverProps } = containerProps;
  const editObjectiveStable = useStableCallback((at: { x: number; y: number }) => openField("objective", at));
  const shortcutMenuTargets = menuState ? targetsFor(menuState.field) : [issue];
  const menuOpen = !!(menuPosition || relationTypeAt || relationType || linkPrOpen || confirmDelete || customPromptOpen || menuState);
  const interactionOpen = menuOpen || uploads.pending.length > 0;
  useLayoutEffect(() => {
    onInteractionChange?.(issue.id, interactionOpen);
    // Activity disconnects effects while retaining dialog state and its owner.
  }, [issue.id, interactionOpen, onInteractionChange]);

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

  // Field shortcuts and the Ask Numo target share the interactive card node.
  // Keep the merged callback stable so React does not detach both refs during
  // unrelated card updates.
  const setCardRef = useCallback(
    (el: HTMLDivElement | null) => {
      shortcutsRef(el);
      askNumoRef(el);
    },
    [shortcutsRef, askNumoRef],
  );

  // A right-click on a card of a multi-ticket selection acts on the whole
  // selection (MIN-833). It is read once, when the menu opens, and kept while
  // it stays open: a rebuild (a realtime update of the ticket, the pull
  // request probe) must not swap the selection entries for the card's own
  // under the pointer, or the entry being clicked unmounts before it fires.
  const menuSelectionRef = useRef<IssueMenuSelection | undefined>(undefined);
  const prStore = useIssuePrStore();
  const menuSelection = (): IssueMenuSelection | undefined => {
    if (!selected) return undefined;
    const issues = selection.getSelectedIssues();
    if (issues.length < 2) return undefined;
    return {
      count: issues.length,
      planned: issues.filter((selectedIssue) => hasPlanTasks(selectedIssue.plan)).length,
      onCopyPrompt: (action) => selection.copyPrompt(action),
      onCustomPrompt: () => {
        setCustomPromptScope("selection");
        setCustomPromptOpen(true);
      },
      onCopyIdentifiers: selection.copyIdentifiers,
      onDelete: selection.getRequestDelete() ?? undefined,
      pullRequests: bulkPullRequestLinks(issues, prStore.get, [], prStore.linkedPullRequestIds).partial
        .map((target) => ({
          prId: target.prId,
          prNumber: target.prNumber,
          onLink: () => {
            const targets = bulkPullRequestLinks(selection.getSelectedIssues(), prStore.get, [], prStore.linkedPullRequestIds)
              .targets(target.prId);
            void linkIssuesToPullRequest(targets, target);
          },
        })),
    };
  };

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
    // in components/ui) —, so emptying it here would empty the ON-SCREEN menu before
    // that it does not disappear. Before the first opening, the list is empty and
    // nothing has ever been returned: that’s where the economy happens.
    if (!menuPosition) return lastMenuActions.current;
    return buildIssueMenuActions({
      issue,
      projectKey,
      agentActions,
      pr,
      prReadiness,
      hasObjectives: !!objectiveMap?.size,
      onSelectRelation: onAddRelation ? setRelationType : undefined,
      hierarchyRelations: onAddRelation && canWrite ? hierarchyRelations() : undefined,
      onOpenField: openFieldAtPointer,
      extraActions: canWrite ? buildMenuActions?.(issue) : undefined,
      onDelete: onDelete ? () => setConfirmDelete(true) : undefined,
      onLinkPullRequest: canWrite && hasLinkablePr ? () => setLinkPrOpen(true) : undefined,
      readOnly: !canWrite,
      selection: menuSelectionRef.current,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    menuPosition,
    buildIssueMenuActions,
    agentActions,
    pr,
    prReadiness,
    onAddRelation,
    issue,
    projectKey,
    objectiveMap,
    buildMenuActions,
    onDelete,
    canWrite,
    hasLinkablePr,
  ]);
  lastMenuActions.current = menuActions;

  return (
    <div
      ref={setCardRef}
      {...hoverProps}
      // Hover, focus and right click announce a copy (⇧P, menu): warm the
      // prompt's forge context so the copy itself never waits (MIN-723).
      onMouseEnter={(e) => {
        hoverProps.onMouseEnter(e);
        prefetchIssuePromptContext([issue.id]);
      }}
      onFocus={() => prefetchIssuePromptContext([issue.id])}
      // A click opens the issue: its live description starts loading now.
      onMouseDown={() => prefetchDescriptionSnapshot("issue", issue.id)}
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
        prefetchIssuePromptContext([issue.id]);
        pointerRef.current = { x: e.clientX, y: e.clientY };
        menuSelectionRef.current = menuSelection();
        setMenuPosition(pointerRef.current);
      }}
      {...(canWrite ? drop.handlers : {})}
      // No touch-action override: drag-and-drop is mouse-only (MouseSensor), so
      // touch is free to scroll the board/columns natively. The grab cursor is
      // a DRAG signal, not an affordance: the card reads as a normal surface on
      // hover; `IssueCard` changes it only after the drag sensor activates.
      className="relative rounded-2xl"
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
            parentId={parent?.id}
            relations={relations}
            onOpenParent={openParent}
            onOpenRelated={onOpenRelated}
            onRemoveRelation={canWrite ? onRemoveRelation : undefined}
            onOpenObjective={onOpenRelated ? openObjective : undefined}
            onEditObjective={canWrite ? editObjectiveStable : undefined}
            onOpenPlan={openPlan}
            pr={pr}
            prReadiness={prReadiness}
            onOpenPr={openPr}
            commentFollowUp={commentFollowUp}
            onCopyCommentsPrompt={copyCommentsPromptStable}
            onUpdate={canWrite ? updateCard : undefined}
            onSetCategories={canWrite ? setCardCategories : undefined}
            inCurrentCycle={inCurrentCycle}
            selected={selected}
            menuOpen={menuOpen}
          />
        );
        return body;
      })()}
      <IssueContextMenu
        position={menuPosition}
        onClose={() => setMenuPosition(null)}
        actions={menuActions}
      />
      {menuPosition && canWrite ? (
        <LinkablePullRequestsProbe projectId={issue.project_id} onChange={setHasLinkablePr} />
      ) : null}
      {linkPrOpen ? (
        <PullRequestPalettePicker
          projectId={issue.project_id}
          subject={identifier}
          onClose={() => setLinkPrOpen(false)}
          onSelect={(target) => {
            setLinkPrOpen(false);
            void linkIssuesToPullRequest([issue.id], {
              prId: target.prId, prNumber: target.pr_number, state: target.pr_state,
            });
          }}
        />
      ) : null}
      <RelationTypePicker
        position={relationTypeAt}
        targetCount={relationTypeAt ? relationTargets().length : 1}
        hierarchy={relationTypeAt ? hierarchyRelations() : undefined}
        onClose={() => setRelationTypeAt(null)}
        onSelect={setRelationType}
      />
      {relationType ? (
        <RelationPalettePicker
          scope={`card-relations:${issue.id}`}
          step={relationType}
          issues={relationCandidates}
          objectives={relationObjectiveCandidates}
          projectKey={projectKey}
          projectId={issue.project_id}
          onPickIssue={(type, targetId) => {
            if (isHierarchyRelation(type)) setParentFromTargets(type, targetId);
            else addRelationFromTargets(type, targetId, { targetType: "issue" });
            closeRelationPicker();
          }}
          onPickObjective={(type, objectiveId) => {
            if (!isHierarchyRelation(type)) addRelationFromTargets(type, objectiveId, { targetType: "objective" });
            closeRelationPicker();
          }}
          onClose={closeRelationPicker}
        />
      ) : null}
      <CustomPromptDialog
        open={customPromptOpen}
        onOpenChange={setCustomPromptOpen}
        onSubmit={(instructions) => {
          if (customPromptScope === "selection") selection.copyPrompt("custom", instructions);
          else void runCustomPrompt(instructions);
        }}
      />
      {/* Portalized too, therefore rendered in the React tree of the map: the
          wrapper stops events which, without it, would go back to the
          click (open the ticket) and the drag sensor. */}
      <div onClick={stop} onMouseDown={stop} onContextMenu={stop}>
        <ConfirmDeleteDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={t("deleteDialogTitle", { title: issue.title })}
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
        targets={shortcutMenuTargets}
        members={cardMemberList}
        categories={cardCategoryList}
        objectives={cardObjectiveList}
        onUpdate={(patch) =>
          linked(() => {
            for (const target of shortcutMenuTargets) onUpdateIssue(target.id, patch);
          })
        }
        onSetCategories={(ids, issueId) => onSetCategories(issueId, ids)}
      />
    </div>
  );
});

type IssueCardProps = ComponentProps<typeof IssueCardContent> & {
  /** Keep dnd-kit's active node mounted without reserving a card slot. */
  landingOutOfFlow?: boolean;
};

/**
 * Keep dnd-kit's frame-by-frame context updates inside this tiny shell. The
 * interactive card is memoized below it, so pointer movement changes only the
 * wrapper transform state instead of replaying every card hook and menu.
 */
export const IssueCard = memo(function IssueCard(props: IssueCardProps) {
  const { landingOutOfFlow = false, ...contentProps } = props;
  // Readers cannot move tickets: their cards never start a drag.
  const { canWrite } = useProjectCapabilities(props.issue.project_id);
  const tDrag = useTranslations("DragAnnouncements");
  // A group, not dnd-kit's default `button`: the card holds its own buttons
  // (status, priority, assignee…), which a button's children would hide from
  // screen readers (WCAG 4.1.2). The role description is localized.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: props.issue.id,
    disabled: !canWrite,
    attributes: { role: "group", roleDescription: tDrag("cardRole") },
  });
  // The drag sensor activates only after pointer movement crosses its threshold.

  return (
    <div
      ref={setNodeRef}
      data-issue-id={props.issue.id}
      data-column-status={props.issue.status}
      data-board-landing-source={landingOutOfFlow ? "" : undefined}
      {...attributes}
      // A reader's card cannot be dragged but still opens: not disabled.
      aria-disabled={undefined}
      {...listeners}
      // dnd-kit makes this wrapper the card's focus stop, but the card opens
      // from its inner surface's click: Enter and Space on the wrapper do the
      // same (WCAG 2.1.1). It replaces the listeners' keydown, which only a
      // KeyboardSensor would use; the boards register none.
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        // Shift+F10 opens the card menu, where Windows has it; macOS browsers
        // fire no context menu for it.
        if (event.key === "F10" && event.shiftKey) {
          event.preventDefault();
          openCardMenuFromKeyboard(event.currentTarget);
          return;
        }
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        (event.currentTarget.firstElementChild as HTMLElement | null)?.click();
      }}
      // The Menu key and a screen reader's menu command reach this focus
      // stop, not the inner surface that builds the menu: hand them over,
      // anchored on the card rather than at the viewport's corner.
      onContextMenu={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        openCardMenuFromKeyboard(event.currentTarget);
      }}
      className={cn(
        "rounded-2xl transition-opacity duration-150 ease-out motion-reduce:transition-none",
        landingOutOfFlow
          ? "invisible absolute pointer-events-none"
          : "relative",
        (isDragging || props.dragging) && "opacity-40",
        (isDragging || props.dragging) && "cursor-grabbing",
      )}
    >
      <IssueCardContent {...contentProps} />
    </div>
  );
});
