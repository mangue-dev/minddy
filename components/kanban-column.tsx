"use client";

import { Fragment, memo, useCallback, useRef } from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "mangue-ui";
import { BOARD_COLUMN_CLASS } from "@/lib/board-layout";
import type { DropPreview } from "@/lib/board-drag";
import {
  BoardDropIndicator,
  BoardDropLandingPlaceholder,
  type BoardLandingPreview,
  useRevealDropIndicator,
} from "@/components/board-drop-indicator";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { StatusMeta, IssueStatus } from "@/lib/issue-constants";
import type {
  Category,
  Issue,
  IssueRelationType,
  IssueUpdateInput,
  Member,
  Objective,
} from "@/lib/types";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { ScrollFadeEdges } from "@/components/scroll-fade-edges";
import { IssueCard } from "@/components/issue-card";
import { StatusIndicator } from "@/components/issue-indicators";
import type { ChipRelation } from "@/components/relation-chips";
import type { ContextMenuAction } from "@/components/issue-context-menu";

/**
 * ⚠ Memorized (MIN-316). The board replayed its columns — therefore all their
 * cards — each time the board was rendered, including for a state that did not concern them. Its props must remain stable for it to bite.
 */
export const KanbanColumn = memo(function KanbanColumn({
  status,
  issues,
  issueMap,
  relationsByIssue,
  getCandidateIssues,
  projectId,
  projectKey,
  memberMap,
  categoryMap,
  objectiveMap,
  onOpenIssue,
  onOpenIssueById,
  onOpenPlan,
  onCreateIssue,
  onUpdateIssue,
  onSetCategories,
  onAddRelation,
  onDeleteIssue,
  buildMenuActions,
  currentCycleId,
  selectedIds,
  draggingIds,
  dropPreview,
  landingPreview,
  onSelect,
}: {
  status: StatusMeta;
  issues: Issue[];
  /** All project issues by id — used to resolve a sub-issue's parent. */
  issueMap: Map<string, Issue>;
  /** Resolved relation chips per issue id (MIN-25). */
  relationsByIssue: Map<string, ChipRelation[]>;
  /** Read lazily when the relation picker opens or a prompt is copied. */
  getCandidateIssues: () => Issue[];
  projectId: string;
  projectKey: string;
  memberMap: Map<string, Member>;
  categoryMap: Map<string, Category>;
  objectiveMap?: Map<string, Objective>;
  onOpenIssue: (issue: Issue) => void;
  onOpenIssueById: (issueId: string) => void;
  onOpenPlan: (issue: Issue) => void;
  onCreateIssue: (status: IssueStatus) => void;
  onUpdateIssue: (issueId: string, patch: IssueUpdateInput) => void;
  onSetCategories: (issueId: string, ids: string[]) => void;
  onAddRelation: (
    sourceId: string,
    type: IssueRelationType,
    targetId: string,
  ) => void;
  /** Trash from right-clicking a card (absent → entry disappears). */
  onDeleteIssue?: (issueId: string) => Promise<void>;
  /** Per-issue extra right-click actions (cycle add/remove — MIN-32). */
  buildMenuActions?: (issue: Issue) => ContextMenuAction[];
  /** My current cycle's id — its cards show the blue cycle icon. */
  currentCycleId?: string | null;
  selectedIds: Set<string>;
  /** Tickets loaded by the current drag — dimmed like the card
 entered, so we can see what the packet contains. */
  draggingIds?: Set<string>;
  /** The drop mark, when dragging is aimed at THIS column. */
  dropPreview?: DropPreview;
  /** The reserved destination slot while the overlay is landing. */
  landingPreview?: BoardLandingPreview;
  onSelect: (issueId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.value });
  const { ref: fadeRef, scrollProps, edges } = useScrollFade<HTMLDivElement>();
  const t = useTranslations("Board");
  const ts = useTranslations("Status");

  // dnd-kit needs the droppable node; useScrollFade needs it to measure scroll;
  // the drop mark is scrolled there when it falls out of the field of vision.
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

  return (
    <div className={cn("flex flex-col", BOARD_COLUMN_CLASS)}>
      <div className="relative z-30 mb-2 flex items-center gap-2 bg-background px-1">
        <StatusIndicator status={status.value} className="size-4" />
        <h2 className="text-sm font-semibold">{ts(status.value)}</h2>
        <span className="relative top-px text-xs text-muted-foreground">
          {displayedCount}
        </span>
      </div>

      {/* Draw the edge fade beside the scroller. A mask on the scrolling
          container would be recomposited every frame (MIN-319). */}
      <div
        className={cn(
          "relative flex min-h-0 flex-1 flex-col rounded-xl",
          // Highlight the destination column. Hovering a card does not set the
          // column's `isOver`, which previously made the background flicker.
          //
          // Keep the rounded background on this wrapper, not the scroller. A
          // rounded scrolling container clips the drop marker in its corner
          // arcs when the marker is at the top (PR 66).
          (dropPreview || landingHere || isOver) && "bg-muted/50",
        )}
      >
        <div
          ref={setScrollRef}
          data-board-column-scroller
          data-board-column-status={status.value}
          onScroll={scrollProps.onScroll}
          className="no-scrollbar flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2"
        >
          {issues.map((issue) => {
            const parent = issue.parent_id
              ? (issueMap.get(issue.parent_id) ?? null)
              : null;
            return (
              <Fragment key={issue.id}>
                {landingHere && landingPreview.beforeIssueId === issue.id && (
                  <BoardDropLandingPlaceholder height={landingPreview.height} />
                )}
                {dropPreview?.beforeIssueId === issue.id && (
                  <BoardDropIndicator count={dropPreview.count} />
                )}
                <IssueCard
                  issue={issue}
                  projectId={projectId}
                  projectKey={projectKey}
                  memberMap={memberMap}
                  categoryMap={categoryMap}
                  objectiveMap={objectiveMap}
                  parent={parent}
                  relations={relationsByIssue.get(issue.id)}
                  getCandidateIssues={getCandidateIssues}
                  onOpenRelated={onOpenIssueById}
                  onAddRelation={onAddRelation}
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
                  onSelect={onSelect}
                  buildMenuActions={buildMenuActions}
                  inCurrentCycle={
                    !!currentCycleId && issue.cycle_id === currentCycleId
                  }
                />
              </Fragment>
            );
          })}
          {/* `beforeIssueId === null`: the packet is placed at the end of the column. */}
          {dropPreview && dropPreview.beforeIssueId === null && (
            <BoardDropIndicator count={dropPreview.count} />
          )}
          {landingHere && landingPreview.beforeIssueId === null && (
            <BoardDropLandingPlaceholder height={landingPreview.height} />
          )}

          <button
            type="button"
            onClick={() => onCreateIssue(status.value)}
            className="flex w-full shrink-0 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-6 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/40 hover:text-foreground"
          >
            <Plus className="size-4" />
            {t("newIssue")}
          </button>
        </div>
        <ScrollFadeEdges edges={edges} className="z-30" />
      </div>
    </div>
  );
}, sameKanbanColumnProps);

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

type ComparableKanbanColumnProps = {
  issues: Issue[];
  issueMap: Map<string, Issue>;
  relationsByIssue: Map<string, ChipRelation[]>;
};

function sameKanbanColumnProps(
  previous: ComparableKanbanColumnProps,
  current: ComparableKanbanColumnProps,
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
        previous.relationsByIssue.get(issue.id),
        current.relationsByIssue.get(issue.id),
      )
    ) {
      return false;
    }
  }
  return true;
}
