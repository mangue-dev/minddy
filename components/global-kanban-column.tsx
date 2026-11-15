"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { memo, useCallback, useMemo, useRef } from "react";
import { useAppRouter } from "@/lib/use-app-router";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { BOARD_COLUMN_CLASS } from "@/lib/board-layout";
import type { DropPreview } from "@/lib/board-drag";
import {
  type BoardLandingPreview,
  useRevealDropIndicator,
} from "@/components/board-drop-indicator";
import { useTranslations } from "next-intl";
import type { StatusMeta, IssueStatus } from "@/lib/issue-constants";
import type {
  Category,
  Issue,
  IssueRelationType,
  IssueUpdateInput,
  Member,
  Objective,
  Project,
} from "@/lib/types";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { ScrollFadeEdges } from "@/components/scroll-fade-edges";
import { BoardWindowedItems } from "@/components/board-windowed-items";
import { IssueCard } from "@/components/issue-card";
import { StatusIndicator } from "@/components/issue-indicators";
import type { ChipRelation } from "@/components/relation-chips";
import type { RelationKinds } from "@/lib/use-issue-relations-query";
import type { ContextMenuAction } from "@/components/issue-context-menu";

const EMPTY_MEMBERS: Map<string, Member> = new Map();
const EMPTY_CATEGORIES: Map<string, Category> = new Map();
const EMPTY_OBJECTIVES: Map<string, Objective> = new Map();

/**
 * One status column of the cross-project kanban (MIN-29). Same droppable +
 * sortable machinery as <KanbanColumn>, but every card is fed its OWN project's
 * key/members/categories/objectives (looked up by `issue.project_id`) so it's a
 * fully interactive project card. The "new issue" footer opens the app-wide
 * create dialog with this column's status preset (the dialog's split button
 * picks the target project — MIN-33).
 *
 * ⚠ Memoized (MIN-316): the board used to re-render every column, and so every
 * card, on any of its renders. Its props must stay stable for that to hold.
 */
export const GlobalKanbanColumn = memo(function GlobalKanbanColumn({
  status,
  issues,
  projectMap,
  issueMap,
  relationsByIssue,
  getCandidateIssues,
  memberMapByProject,
  categoryMapByProject,
  objectiveMapByProject,
  onOpenIssue,
  onOpenIssueById,
  onOpenPlan,
  onUpdateIssue,
  onSetCategories,
  selectedIds,
  draggingIds,
  dropPreview,
  landingPreview,
  onSelect,
  onCreateIssue,
  onAddRelation,
  onRemoveRelation,
  onDeleteIssue,
  buildMenuActions,
  currentCycleId,
  canWriteIn,
}: {
  status: StatusMeta;
  issues: Issue[];
  projectMap: Map<string, Project>;
  /** Every board issue by id — resolves a sub-issue's parent (same project). */
  issueMap: Map<string, Issue>;
  /** Resolved relation chips per issue id (MIN-25). */
  relationsByIssue?: Map<string, ChipRelation[]>;
  /** Read lazily when a card opens the same-project relation picker. */
  getCandidateIssues?: (projectId: string) => Issue[] | undefined;
  memberMapByProject: Map<string, Map<string, Member>>;
  categoryMapByProject: Map<string, Map<string, Category>>;
  objectiveMapByProject: Map<string, Map<string, Objective>>;
  onOpenIssue: (issue: Issue) => void;
  /** Opens a related issue's side panel (clicking a relation chip). */
  onOpenIssueById?: (issueId: string) => void;
  onOpenPlan: (issue: Issue) => void;
  onUpdateIssue: (issueId: string, patch: IssueUpdateInput) => void;
  onSetCategories: (issueId: string, ids: string[]) => void;
  selectedIds: Set<string>;
  /** The issues the current drag carries — dimmed like the dragged card. */
  draggingIds?: Set<string>;
  /** The drop mark, when dragging is aimed at THIS column. */
  dropPreview?: DropPreview;
  /** The reserved destination slot while the overlay is landing. */
  landingPreview?: BoardLandingPreview;
  onSelect: (issueId: string) => void;
  /** Whether the viewer may edit this project's issues: read-only cards are
      never selectable (MIN-693). */
  canWriteIn: (projectId: string) => boolean;
  /** Absent → no "new issue" footer (cycle mode — a create wouldn't join the cycle). */
  onCreateIssue?: (status: IssueStatus) => void;
  onAddRelation?: (
    sourceId: string,
    type: IssueRelationType,
    targetId: string,
    kinds?: RelationKinds,
  ) => void;
  onRemoveRelation?: (relationId: string) => void;
  /** Trash from right-clicking a card. */
  onDeleteIssue?: (issueId: string) => Promise<boolean>;
  /** Per-issue extra right-click actions (cycle add/remove — MIN-32). */
  buildMenuActions?: (issue: Issue) => ContextMenuAction[];
  /** My current cycle's id — its cards show the blue cycle icon. */
  currentCycleId?: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.value });
  const { ref: fadeRef, scrollProps, edges } = useScrollFade<HTMLDivElement>();
  const router = useAppRouter();
  const t = useTranslations("Board");
  const ts = useTranslations("Status");

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const setScrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollerRef.current = node;
      setNodeRef(node);
      fadeRef(node);
    },
    [setNodeRef, fadeRef],
  );
  useRevealDropIndicator(scrollerRef, dropPreview);
  const landingHere = landingPreview?.status === status.value;
  const displayedCount = landingPreview
    ? issues.filter((issue) => !landingPreview.activeIds.has(issue.id)).length +
      (landingHere ? landingPreview.activeIds.size : 0)
    : issues.length;

  // The relation picker lists the card's own project only; one stable reader
  // per project keeps the cards' memoization (MIN-316).
  const candidateReaders = useMemo(() => {
    const cache = new Map<string, () => Issue[] | undefined>();
    return (pid: string) => {
      if (!getCandidateIssues) return undefined;
      let read = cache.get(pid);
      if (!read) {
        read = () => getCandidateIssues(pid);
        cache.set(pid, read);
      }
      return read;
    };
  }, [getCandidateIssues]);

  return (
    <div className={cn("flex flex-col", BOARD_COLUMN_CLASS)}>
      <div className="relative z-30 mb-2 flex items-center gap-2 bg-background px-1">
        <StatusIndicator status={status.value} className="size-4" />
        <h2 className="text-sm font-semibold">{ts(status.value)}</h2>
        <span className="relative top-px text-xs text-muted-foreground">
          {displayedCount}
        </span>
      </div>

      {/* The edge fade is drawn NEXT to the scroller, never on it: a
          `mask-image` on a scrolling container recomposites it every frame
          (MIN-319). Hence this `relative` parent. */}
      <div
        className={cn(
          "relative flex min-h-0 flex-1 flex-col rounded-xl",
          // The background and its rounding stay OUT of the scroller, as in
          // KanbanColumn (a rounded scroller clips its content).
          (dropPreview || landingHere || isOver) && "bg-muted/50",
        )}
      >
        <div
          ref={setScrollRef}
          data-board-column-scroller
          data-board-column-status={status.value}
          onScroll={scrollProps.onScroll}
          className="no-scrollbar flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2 max-sm:px-1"
        >
          <BoardWindowedItems
            issues={issues}
            status={status.value}
            scrollerRef={scrollerRef}
            dropPreview={dropPreview}
            landingPreview={landingPreview}
            renderIssue={(issue, onInteractionChange) => {
              const project = projectMap.get(issue.project_id);
              const pid = issue.project_id;
              const parent = issue.parent_id
                ? (issueMap.get(issue.parent_id) ?? null)
                : null;
              return (
                <IssueCard
                  onInteractionChange={onInteractionChange}
                  onNavigate={router.push}
                  issue={issue}
                  projectId={pid}
                  projectKey={project?.key ?? ""}
                  project={project}
                  memberMap={memberMapByProject.get(pid) ?? EMPTY_MEMBERS}
                  categoryMap={
                    categoryMapByProject.get(pid) ?? EMPTY_CATEGORIES
                  }
                  objectiveMap={
                    objectiveMapByProject.get(pid) ?? EMPTY_OBJECTIVES
                  }
                  parent={parent}
                  relations={relationsByIssue?.get(issue.id)}
                  getCandidateIssues={candidateReaders(pid)}
                  onOpenRelated={onOpenIssueById}
                  onAddRelation={onAddRelation}
                  onRemoveRelation={onRemoveRelation}
                  onOpenPlan={onOpenPlan}
                  onOpenIssue={onOpenIssue}
                  onUpdateIssue={onUpdateIssue}
                  onSetCategories={onSetCategories}
                  onDelete={onDeleteIssue}
                  selected={selectedIds.has(issue.id)}
                  dragging={draggingIds?.has(issue.id)}
                  landingOutOfFlow={
                    landingPreview?.activeIds.has(issue.id) ? true : undefined
                  }
                  onSelect={canWriteIn(pid) ? onSelect : undefined}
                  buildMenuActions={buildMenuActions}
                  inCurrentCycle={
                    !!currentCycleId && issue.cycle_id === currentCycleId
                  }
                />
              );
            }}
          />

          {onCreateIssue && (
            <button
              type="button"
              onClick={() => onCreateIssue(status.value)}
              className="flex w-full shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border py-6 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/40 hover:text-foreground"
            >
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
              {t("newIssue")}
            </button>
          )}
        </div>
        <ScrollFadeEdges edges={edges} className="z-30" />
      </div>
    </div>
  );
}, sameGlobalKanbanColumnProps);

function sameRelations(
  previous: ChipRelation[] | undefined,
  current: ChipRelation[] | undefined,
) {
  if (previous === current) return true;
  if (!previous || !current || previous.length !== current.length) return false;
  return previous.every((relation, index) => {
    const next = current[index];
    return (
      relation.id === next.id &&
      relation.relation === next.relation &&
      relation.otherId === next.otherId &&
      relation.otherNumber === next.otherNumber &&
      relation.resolved === next.resolved
    );
  });
}

type ComparableGlobalKanbanColumnProps = {
  issues: Issue[];
  issueMap: Map<string, Issue>;
  relationsByIssue?: Map<string, ChipRelation[]>;
};

function sameGlobalKanbanColumnProps(
  previous: ComparableGlobalKanbanColumnProps,
  current: ComparableGlobalKanbanColumnProps,
) {
  const before = previous as unknown as Record<string, unknown>;
  const after = current as unknown as Record<string, unknown>;
  for (const key of Object.keys(before)) {
    if (key === "issueMap" || key === "relationsByIssue") continue;
    if (before[key] !== after[key]) return false;
  }
  for (const issue of current.issues) {
    const parentId = issue.parent_id;
    if (
      parentId &&
      previous.issueMap.get(parentId)?.number !==
        current.issueMap.get(parentId)?.number
    ) {
      return false;
    }
    if (
      !sameRelations(
        previous.relationsByIssue?.get(issue.id),
        current.relationsByIssue?.get(issue.id),
      )
    ) {
      return false;
    }
  }
  return true;
}
