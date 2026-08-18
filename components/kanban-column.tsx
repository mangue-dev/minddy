"use client";

import { Fragment, memo, useCallback, useRef } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { cn } from "mangue-ui";
import { BOARD_COLUMN_CLASS } from "@/lib/board-layout";
import { NO_SHIFT_STRATEGY } from "@/lib/board-dnd";
import type { DropPreview } from "@/lib/board-drag";
import {
  BoardDropIndicator,
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
  candidateIssues,
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
  onSelect,
}: {
  status: StatusMeta;
  issues: Issue[];
  /** All project issues by id — used to resolve a sub-issue's parent. */
  issueMap: Map<string, Issue>;
  /** Resolved relation chips per issue id (MIN-25). */
  relationsByIssue: Map<string, ChipRelation[]>;
  /** All project issues — candidates for the "add relation" picker. */
  candidateIssues: Issue[];
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
    targetId: string
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
    [setNodeRef, fadeRef]
  );
  useRevealDropIndicator(scrollerRef, dropPreview);

  return (
    <div className={cn("flex flex-col", BOARD_COLUMN_CLASS)}>
      <div className="mb-2 flex items-center gap-2 px-1">
        <StatusIndicator status={status.value} className="size-4" />
        <h2 className="text-sm font-semibold">{ts(status.value)}</h2>
        <span className="text-xs text-muted-foreground">{issues.length}</span>
      </div>

      {/* The edge fade is drawn NEXT to the scroller, never on it: a
 `mask-image` on a scrolling container causes it to recompose to
 each frame (MIN-319). Hence this parent `relative`. */}
      <div
        className={cn(
          "relative flex min-h-0 flex-1 flex-col rounded-xl transition-colors",
          // The background lights up on the column that WILL RECEIVE, not the one that the
          // pointer touches: hovering over a card does not make its column
          // a `isOver`, and the background flashed from one card to another.
          //
          // ⚠ The background AND its rounding are HERE, not on the scroller: a
          // `rounded-xl` placed on a container which scrolls CROPS its contents
          // in the four corner arcs. The point of the deposit marker is there
          // made to nibble as soon as the line fell at the top of the column
          // (PR 66). Same box, same rounding on the screen, but the cutting of the
          // scroller becomes square again.
          (dropPreview || isOver) && "bg-muted/50"
        )}
      >
        <div
          ref={setScrollRef}
          onScroll={scrollProps.onScroll}
          className="no-scrollbar flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2"
        >
          <SortableContext
            items={issues.map((i) => i.id)}
            strategy={NO_SHIFT_STRATEGY}
          >
            {issues.map((issue) => {
              const parent = issue.parent_id
                ? issueMap.get(issue.parent_id) ?? null
                : null;
              return (
                <Fragment key={issue.id}>
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
                    candidateIssues={candidateIssues}
                    onOpenRelated={onOpenIssueById}
                    onAddRelation={onAddRelation}
                    onOpenPlan={onOpenPlan}
                    onOpenIssue={onOpenIssue}
                    onUpdateIssue={onUpdateIssue}
                    onSetCategories={onSetCategories}
                    onDelete={onDeleteIssue}
                    selected={selectedIds.has(issue.id)}
                    dragging={draggingIds?.has(issue.id)}
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
          </SortableContext>

          <button
            type="button"
            onClick={() => onCreateIssue(status.value)}
            className="flex w-full shrink-0 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-6 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/40 hover:text-foreground"
          >
            <Plus className="size-4" />
            {t("newIssue")}
          </button>
        </div>
        <ScrollFadeEdges edges={edges} />
      </div>
    </div>
  );
});
