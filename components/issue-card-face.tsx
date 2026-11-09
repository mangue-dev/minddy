"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  AiAutoRotateIcon,
  Comment01Icon,
  GitMergeIcon,
  GitPullRequestDraftIcon,
  GitPullRequestIcon,
  HierarchySquare01Icon,
  RepeatIcon,
  TaskDone01Icon,
  TriangleIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { AppIcon } from "@/components/icon";
import { DATE_ICON, SMART_ASSIGN_ICON } from "@/components/feature-icons";
import {
  EffortIndicator,
  PriorityIndicator,
  StatusIndicator,
} from "@/components/issue-indicators";
import { ObjectiveBadge } from "@/components/objective-label";
import { ProjectOrb } from "@/components/project-orb";
import { RelationChips, type ChipRelation } from "@/components/relation-chips";
import { RemoteIssueIndicator } from "@/components/remote-issue-indicator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TruncatedText } from "@/components/ui/truncated-text";
import { UserAvatar } from "@/components/user-avatar";
import { isPrWorthShowing, type IssuePr } from "@/lib/issue-pr";
import type { CommentFollowUp } from "@/lib/comment-follow-up";
import { dueDateFormat, parseDueDate } from "@/lib/due-date";
import { displayName } from "@/lib/display-name";
import { issueIdentifier, type IssueEffort, type IssuePriority, type IssueStatus } from "@/lib/issue-constants";
import { planProgress, type PlanProgress } from "@/lib/plan";
import { plainMarkdownParts } from "@/lib/plain-markdown";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { useSmartAssignFillsEmpty } from "@/lib/use-smart-assign-empty";
import type {
  IssueCardCategory,
  IssueCardIssue,
  IssueCardObjective,
  Member,
  Project,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The issue card as it looks, apart from what it does.
 *
 * `IssueCardBody` (components/issue-card.tsx) puts its pickers and menus in
 * this face's slots; a read-only surface (the shared board, the landing's
 * figures) renders the face alone. Its imports stay light on purpose — no
 * data hooks, drag-and-drop, menus or pickers — and
 * `issue-card-face.test.tsx` holds both promises: the same DOM as the body
 * without callbacks, and an import graph that never reaches the app's heavy
 * surfaces.
 */

// Hover: a faint tint and a slightly firmer edge, kept light so a hovered card
// still reads as a card and not as a grey block: 2.5% of the foreground over
// the card and a border at 15%, one step above the 10% at rest. One value for
// both themes, so a selected card's own hover tint keeps winning in dark too.
// The tint also stays while one of the card's menus or pickers is open
// (`data-menu-open`, or a pill whose picker is open), pointer on it or not:
// the card reads as the one the open surface acts on.
const CARD_HOVER =
  "pointer-fine:hover:border-foreground/15 pointer-fine:hover:bg-[color-mix(in_oklab,var(--card)_97.5%,var(--foreground))] " +
  "data-menu-open:border-foreground/15 data-menu-open:bg-[color-mix(in_oklab,var(--card)_97.5%,var(--foreground))] " +
  "has-[[aria-expanded=true]]:border-foreground/15 has-[[aria-expanded=true]]:bg-[color-mix(in_oklab,var(--card)_97.5%,var(--foreground))]";
const CARD_HELD =
  "data-held:cursor-grabbing data-held:border-foreground/15 data-held:bg-[color-mix(in_oklab,var(--card)_97.5%,var(--foreground))] data-held:shadow-md";

/* Read-only, the glyph is the value's only trace: an image named by it
   (WCAG 1.1.1). The pickers name their trigger the same way. */
export function IssueCardStatus({ value }: { value: IssueStatus }) {
  const tStatus = useTranslations("Status");
  return (
    <span role="img" aria-label={tStatus(value)} className="inline-flex shrink-0">
      <StatusIndicator status={value} />
    </span>
  );
}

export function IssueCardPriority({ value }: { value: IssuePriority }) {
  const tPriority = useTranslations("Priority");
  return (
    <span role="img" aria-label={tPriority(value)} className="inline-flex shrink-0">
      <PriorityIndicator priority={value} />
    </span>
  );
}

/** The effort, or a faded triangle and a dash while it is unset. */
export function IssueCardEffort({ value }: { value: IssueEffort | null }) {
  return value ? (
    <EffortIndicator effort={value} />
  ) : (
    <span className="inline-flex items-center gap-1 text-muted-foreground/60">
      <HugeiconsIcon icon={TriangleIcon} className="size-[18px] shrink-0" />
      <span className="text-sm font-medium leading-none">–</span>
    </span>
  );
}

/** The first category's dot and name, then how many more. */
export function IssueCardCategories({
  categories,
  selectedIds,
}: {
  categories: readonly IssueCardCategory[];
  selectedIds: string[];
}) {
  const t = useTranslations("IssueUI");
  const selected = categories.filter((category) => selectedIds.includes(category.id));
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

/**
 * The assignee's portrait, or a dashed circle naming the empty state. `named`
 * adds the person's name as a native tooltip: off inside a picker, whose own
 * tooltip already names the field.
 */
export function IssueCardAssigneeAvatar({
  assignee,
  smartAssign,
  emptyLabel,
  named = true,
}: {
  assignee: Member | null;
  smartAssign: boolean;
  emptyLabel: string;
  named?: boolean;
}) {
  return assignee ? (
    <UserAvatar
      seed={assignee.avatar_seed}
      title={named ? displayName(assignee) : undefined}
      className="size-6"
    />
  ) : (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground/60">
          <HugeiconsIcon icon={smartAssign ? SMART_ASSIGN_ICON : UserIcon} className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{emptyLabel}</TooltipContent>
    </Tooltip>
  );
}

function IssueCardAssignee({
  assignee,
  projectId,
  status,
}: {
  assignee: Member | null;
  projectId: string;
  status: string;
}) {
  const tField = useTranslations("Field");
  // The project's Smart Assign fills an empty assignee (MIN-811): the empty
  // state names it, as in the issue panel.
  const smartAssign = useSmartAssignFillsEmpty(projectId, status);
  return (
    <IssueCardAssigneeAvatar
      assignee={assignee}
      smartAssign={smartAssign}
      emptyLabel={tField(smartAssign ? "smartAssign" : "unassigned")}
    />
  );
}

export function IssueCardDueDate({
  value,
  recurrence,
}: {
  value: string;
  recurrence: IssueCardIssue["recurrence"];
}) {
  const format = useFormatter();
  const parsed = parseDueDate(value);
  if (!parsed) return null;
  return (
    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <HugeiconsIcon icon={recurrence ? RepeatIcon : DATE_ICON} className="size-3 shrink-0" />
      {format.dateTime(parsed, dueDateFormat(parsed, { compact: true }))}
    </span>
  );
}

/** The card's compact line keeps its small text, at the avatar's height, and
    names the objective alone: no status glyph there. */
export function IssueCardObjectiveDisplay({ objective }: { objective: IssueCardObjective }) {
  const tField = useTranslations("Field");
  return (
    <ObjectiveBadge
      objective={{ name: objective.name, color: objective.color }}
      size="sm"
      className="h-6"
      tooltip={tField("objectiveLinked")}
    />
  );
}

/** Checklist icon + "done/total": the plan's progress, shown when it has tasks. */
export function IssueCardPlanContent({ progress }: { progress: PlanProgress }) {
  return (
    <>
      <HugeiconsIcon icon={TaskDone01Icon} className="size-3.5 shrink-0" />
      <span className="tabular-nums">
        {progress.done}/{progress.total}
      </span>
    </>
  );
}

/** The new comments' count (MIN-801), its label carried by the tooltip. */
export function IssueCardCommentFollowUp({ followUp }: { followUp: CommentFollowUp }) {
  const t = useTranslations("IssueUI");
  const label = t("commentsPendingLabel", { count: followUp.count });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={COMMENT_FOLLOW_UP_CLASS} aria-label={label}>
          <IssueCardCommentFollowUpContent count={followUp.count} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export const COMMENT_FOLLOW_UP_CLASS =
  "flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-medium text-brand";

export function IssueCardCommentFollowUpContent({ count }: { count: number }) {
  return (
    <>
      <HugeiconsIcon icon={Comment01Icon} className="size-3.5 shrink-0" />
      <span className="tabular-nums">{count}</span>
    </>
  );
}

/**
 * The pull request chip's state, in GitHub's colors as everywhere else: GREEN
 * when open, PURPLE when merged, NEUTRAL while a draft. The color and icon
 * already say the state, so the chip shows the number (MIN-735); the state
 * words stay for the tooltip and screen readers.
 */
export function pullRequestChip(state: IssuePr["state"], t: (key: "prMerged" | "prBadge" | "prOpen") => string) {
  const merged = state === "merged";
  const draft = state === "draft";
  return {
    icon: merged ? GitMergeIcon : draft ? GitPullRequestDraftIcon : GitPullRequestIcon,
    label: merged ? t("prMerged") : draft ? t("prBadge") : t("prOpen"),
    tone: merged
      ? "text-violet-700 dark:text-violet-400"
      : draft
        ? "text-foreground/80"
        : "text-emerald-600 dark:text-emerald-500",
    hover: merged
      ? "hover:bg-violet-500/10 focus-visible:bg-violet-500/10"
      : draft
        ? "hover:bg-muted focus-visible:bg-muted"
        : "hover:bg-emerald-500/10 focus-visible:bg-emerald-500/10",
  };
}

export function IssueCardPullRequestContent({
  state,
  number,
}: {
  state: IssuePr["state"];
  number: number;
}) {
  const t = useTranslations("Agent");
  const chip = pullRequestChip(state, t);
  return (
    <>
      <AppIcon icon={chip.icon} className="size-3.5 shrink-0" />
      <span className="truncate tabular-nums">#{number}</span>
      <span className="sr-only">{chip.label}</span>
    </>
  );
}

function IssueCardPullRequest({ state, number }: { state: IssuePr["state"]; number: number }) {
  const t = useTranslations("Agent");
  return (
    <span className={cn("flex items-center gap-1 text-[11px] font-medium", pullRequestChip(state, t).tone)}>
      <IssueCardPullRequestContent state={state} number={number} />
    </span>
  );
}

/** The description's first lines. Typed mentions need their resolver, which
    is too heavy for this module: a surface that shows them passes the
    `description` slot (see `issue-card-rich-slots.tsx`); the plain text alone
    is shown otherwise. */
function IssueCardDescription({ description }: { description: string | null }) {
  // Limited to the first 400 characters: three truncated lines need no more,
  // and the rest of the body is never read (MIN-316).
  const parts = description ? plainMarkdownParts(description.slice(0, 400)) : [];
  if (!parts.length) return null;
  return (
    <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
      {parts.filter((part) => typeof part === "string")}
    </p>
  );
}

export interface IssueCardFaceSlots {
  /** Who filed the issue: an integration's indicator. */
  integration?: ReactNode;
  parent?: ReactNode;
  relations?: ReactNode;
  description?: ReactNode;
  commentFollowUp?: ReactNode;
  /** The pull request (with its readiness) or the plan's progress. */
  activity?: ReactNode;
  assignee?: ReactNode;
  status?: ReactNode;
  priority?: ReactNode;
  effort?: ReactNode;
  categories?: ReactNode;
  objective?: ReactNode;
  dueDate?: ReactNode;
}

export interface IssueCardFaceProps {
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
  /** This issue's relations (blocks/blocked-by/related), pre-sorted by priority —
      the highest-signal one shows as a chip after the identifier. */
  relations?: ChipRelation[];
  /** The issue is in my current cycle: a blue cycle icon before the identifier. */
  inCurrentCycle?: boolean;
  pr?: IssuePr | null;
  selected?: boolean;
  /** A menu or picker of this card is open: the card keeps its hover tint. */
  menuOpen?: boolean;
  commentFollowUp?: CommentFollowUp | null;
  slots?: IssueCardFaceSlots;
}

export function IssueCardFace({
  issue,
  projectKey,
  project,
  memberMap,
  categoryMap,
  objectiveMap,
  parentNumber,
  relations,
  inCurrentCycle,
  pr,
  selected,
  menuOpen,
  commentFollowUp,
  slots,
}: IssueCardFaceProps) {
  const t = useTranslations("IssueUI");
  const tCycles = useTranslations("Cycles");
  const plan = planProgress(issue.plan);
  const assignee = issue.assignee_id ? (memberMap.get(issue.assignee_id) ?? null) : null;
  const objective =
    issue.objective_id && objectiveMap ? (objectiveMap.get(issue.objective_id) ?? null) : null;

  return (
    <div
      data-card-surface=""
      data-menu-open={menuOpen ? "" : undefined}
      className={cn(
        // Cards sit flat on the column, outlined by their border alone; only
        // the drag overlay lifts. Concentric corners: the 24px radius sits
        // 12px around the 24px avatar (12px radius) in the top-right corner.
        // Text in the other corners is centered in 24px lines, so it sits
        // 18px from the top and bottom edges: an 18px side inset puts it as
        // far from the left edge, on the same arc.
        // A firmer edge than the app's light borders: cards sit side by side
        // on the column and must read as separate objects.
        "flex flex-col gap-2 rounded-2xl border border-foreground/10 px-[18px] py-3 text-left transition-colors duration-150",
        // Bulk selection (MIN-75): blue-tinted background instead of an outline.
        selected ? "bg-primary/10" : "bg-card",
        // Hovered, and held while it is dragged, the card firms up its edge a
        // little and takes a faint tint: the drag overlay keeps the hovered look.
        CARD_HOVER,
        CARD_HELD,
        selected && "pointer-fine:hover:bg-primary/15 data-menu-open:bg-primary/15 has-[[aria-expanded=true]]:bg-primary/15 data-held:bg-primary/15",
      )}
    >
      {/* Cross-project boards only: the issue's origin project (orb + name). */}
      {project && (
        <div className="-mb-0.5 flex h-6 items-center gap-1.5 text-[11px] text-muted-foreground">
          <ProjectOrb
            seed={projectOrbSeed(project)}
            iconUrl={project.icon_url}
            // A rounded square at this size, as the project's pill: the orb's
            // default 5px radius makes a 14px icon a disc.
            className="size-3.5 rounded-[3px]"
          />
          <span className="truncate">{project.name}</span>
        </div>
      )}

      {/* Identifier (prefixed by cycle / integration icons when applicable) + assignee */}
      {/* One 24px line: the identifier, the plan or PR chip and the avatar
          share its center. */}
      <div className="flex h-6 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 font-mono text-[11px] leading-4 text-muted-foreground">
          {inCurrentCycle && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex shrink-0 items-center text-blue-500 dark:text-blue-400">
                  <AppIcon icon={AiAutoRotateIcon} className="size-3" aria-label={tCycles("inCurrentCycle")} />
                </span>
              </TooltipTrigger>
              <TooltipContent>{tCycles("inCurrentCycle")}</TooltipContent>
            </Tooltip>
          )}
          {slots?.integration}
          <RemoteIssueIndicator issue={issue} iconClassName="size-3" />
          {parentNumber != null &&
            (slots?.parent ?? (
              <button
                type="button"
                disabled
                aria-label={t("openParentAria", { id: issueIdentifier(projectKey, parentNumber) })}
                className="shrink-0 rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <HugeiconsIcon icon={HierarchySquare01Icon} className="size-3" aria-hidden />
              </button>
            ))}
          <span className="shrink-0 whitespace-nowrap">{issueIdentifier(projectKey, issue.number)}</span>
          {relations &&
            relations.length > 0 &&
            (slots?.relations ?? (
              <RelationChips relations={relations} projectKey={projectKey} className="shrink-0" />
            ))}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {commentFollowUp && (slots?.commentFollowUp ?? <IssueCardCommentFollowUp followUp={commentFollowUp} />)}
          {/* An actionable PR takes the place of plan progress. */}
          {slots?.activity ??
            (pr && isPrWorthShowing(pr) ? (
              <span className="flex items-center gap-0.5">
                <IssueCardPullRequest state={pr.state} number={pr.prNumber} />
              </span>
            ) : plan.total > 0 ? (
              <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <IssueCardPlanContent progress={plan} />
              </span>
            ) : null)}
          {/* Back in the corner, 12px from both edges: concentric with it. */}
          <span className="-mr-1.5 flex">
            {slots?.assignee ?? (
              <IssueCardAssignee assignee={assignee} projectId={issue.project_id} status={issue.status} />
            )}
          </span>
        </span>
      </div>

      {/* Title + description (tight spacing between them, and to the row above) */}
      <div className="-mt-1 flex flex-col gap-0.5">
        <TruncatedText text={issue.title} className="line-clamp-2 text-sm font-semibold leading-snug" />
        {slots?.description ?? <IssueCardDescription description={issue.description} />}
      </div>

      {/* Indicators — spread edge-to-edge: status · priority · effort · category */}
      {/* Last line of a card without objective or due date: 4px more keeps
          its icons as far from the bottom edge as from the left one. */}
      <div className="flex items-center justify-between pt-0.5 last:pb-1">
        {slots?.status ?? <IssueCardStatus value={issue.status} />}
        {slots?.priority ?? <IssueCardPriority value={issue.priority} />}
        {slots?.effort ?? <IssueCardEffort value={issue.effort} />}
        {slots?.categories ?? (
          <IssueCardCategories categories={[...categoryMap.values()]} selectedIds={issue.category_ids} />
        )}
      </div>

      {/* Bottom line — linked objective (left) + due date (right) */}
      {(objective || issue.due_date) && (
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex min-w-0 flex-1 items-center">
            {objective && (slots?.objective ?? <IssueCardObjectiveDisplay objective={objective} />)}
          </div>
          {issue.due_date && (
            <div className="shrink-0">
              {slots?.dueDate ?? <IssueCardDueDate value={issue.due_date} recurrence={issue.recurrence} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
