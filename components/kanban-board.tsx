"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { cn, toast } from "mangue-ui";
import type { IssueStatus, StatusMeta } from "@/lib/issue-constants";
import type {
  Category,
  Issue,
  IssueRelation,
  IssueRelationType,
  IssueUpdateInput,
  Member,
  Objective,
  ViewSort,
} from "@/lib/types";
import { resolveRelationsByIssue } from "@/lib/relation-constants";
import { issueComparator } from "@/lib/view-filter";
import { createBoardColumnsBuilder } from "@/lib/board-columns";
import {
  BOARD_DROP_ANIMATION,
  BOARD_MOUSE_ACTIVATION_DISTANCE,
  boardCollision,
} from "@/lib/board-dnd";
import { useBoardDrop } from "@/lib/use-board-drop";
import { useBoardCardAnimations } from "@/lib/use-board-card-animations";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { BOARD_SCROLLER_CLASS } from "@/lib/board-layout";
import { ScrollFadeEdges } from "@/components/scroll-fade-edges";
import { KanbanColumn } from "@/components/kanban-column";
import { IssueCardBody } from "@/components/issue-card";
import { AgentActivityProvider } from "@/components/agent/agent-activity-context";
import { BulkIssueActions } from "@/components/bulk-issue-actions";
import { AskNumoProvider } from "@/lib/ask-numo-context";
import {
  MarqueeOverlay,
  useMarqueeSelection,
} from "@/components/marquee-selection";
import { splitCycleSelection } from "@/components/cycle/use-cycle-menu-actions";
import type { ChipRelation } from "@/components/relation-chips";
import type { ContextMenuAction } from "@/components/issue-context-menu";

export function KanbanBoard({
  issues,
  allIssues,
  relations,
  statuses,
  sort,
  projectId,
  projectKey,
  members,
  categories,
  objectives,
  onOpenIssue,
  onOpenIssueById,
  onOpenPlan,
  onCreateIssue,
  onUpdateIssue,
  onDeleteIssue,
  onAskNumo,
  onSetCategories,
  onAddRelation,
  onMove,
  buildMenuActions,
  currentCycleId,
  onSetCycle,
}: {
  issues: Issue[];
  /** Every project issue (unfiltered) — resolves relation targets that a view
      filter hides from the board, and feeds the "add relation" picker. */
  allIssues: Issue[];
  relations: IssueRelation[];
  statuses: StatusMeta[];
  sort: ViewSort;
  projectId: string;
  projectKey: string;
  members: Member[];
  categories: Category[];
  objectives: Objective[];
  onOpenIssue: (issue: Issue) => void;
  onOpenIssueById: (issueId: string) => void;
  onOpenPlan: (issue: Issue) => void;
  onCreateIssue: (status: IssueStatus) => void;
  onUpdateIssue: (issueId: string, patch: IssueUpdateInput) => void;
  onDeleteIssue?: (issueId: string) => Promise<void>;
  onAskNumo: (issues: Issue[]) => void;
  onSetCategories: (issueId: string, ids: string[]) => void;
  onAddRelation: (
    sourceId: string,
    type: IssueRelationType,
    targetId: string
  ) => void;
  onMove: (
    issueId: string,
    patch: { status?: IssueStatus; position: number }
  ) => Promise<void>;
  /** Per-issue extra right-click actions (cycle add/remove — MIN-32). */
  buildMenuActions?: (issue: Issue) => ContextMenuAction[];
  /** My current cycle's id — its cards show the blue cycle icon. */
  currentCycleId?: string | null;
  /** Moves one issue in/out of the cycle — same handler as the right-click
      action, reused by the selection's bulk cycle rows. */
  onSetCycle?: (issue: Issue, cycleId: string | null) => void;
}) {
  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.user_id, m])),
    [members]
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );
  const objectiveMap = useMemo(
    () => new Map((objectives ?? []).map((o) => [o.id, o])),
    [objectives]
  );
  const issueMap = useMemo(
    () => new Map(issues.map((i) => [i.id, i])),
    [issues]
  );
  // Relation targets resolve against ALL issues (a view filter may hide the
  // other end of a relation from the board).
  const allIssueMap = useMemo(
    () => new Map(allIssues.map((i) => [i.id, i])),
    [allIssues]
  );
  const candidateIssuesRef = useRef(allIssues);
  candidateIssuesRef.current = allIssues;
  const getCandidateIssues = useCallback(
    () => candidateIssuesRef.current,
    []
  );
  const relationsByIssue = useMemo(() => {
    const map = new Map<string, ChipRelation[]>();
    if (relations.length === 0) return map;
    // Blocker statuses drive relation resolution (a done blocker no longer blocks).
    const statusById = new Map(
      Array.from(allIssueMap.values(), (i) => [i.id, i.status] as const)
    );
    const resolvedByIssue = resolveRelationsByIssue(relations, statusById);
    for (const issue of issues) {
      const resolved = (resolvedByIssue.get(issue.id) ?? [])
        .map((r) => {
          const other = allIssueMap.get(r.otherId);
          return other ? { ...r, otherNumber: other.number } : null;
        })
        .filter((r): r is ChipRelation => r !== null);
      if (resolved.length > 0) map.set(issue.id, resolved);
    }
    return map;
  }, [issues, relations, allIssueMap]);

  const buildColumns = useMemo(() => createBoardColumnsBuilder(), []);
  const comparator = useMemo(() => issueComparator(sort), [sort]);
  const columns = useMemo(
    () => buildColumns(statuses, issues, comparator),
    [buildColumns, issues, statuses, comparator]
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelection = useCallback((issueId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(issueId)) next.delete(issueId);
      else next.add(issueId);
      return next;
    });
  }, []);
  const selectedIssues = useMemo(
    () => issues.filter((issue) => selectedIds.has(issue.id)),
    [issues, selectedIds]
  );
  const updateSelected = useCallback(
    (patch: IssueUpdateInput) => {
      selectedIssues.forEach((issue) => onUpdateIssue(issue.id, patch));
    },
    [onUpdateIssue, selectedIssues]
  );
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  // Lasso on the bottom of the board: same selection, one gesture less than thirty
  // ⇧-clicks. The column container serves as both a starting surface,
  // limit and autoscroll.
  const {
    ref: marqueeRef,
    onPointerDown: onMarqueePointerDown,
    overlayRef: marqueeOverlayRef,
  } = useMarqueeSelection<HTMLDivElement>({
    selected: selectedIds,
    onChange: setSelectedIds,
  });
  // Cycle movements on the selection: a ticket already in it can
  // exit, a living ticket can enter — a mixed selection offers both.
  const bulkCycle = useMemo(() => {
    if (!currentCycleId || !onSetCycle) return undefined;
    const { addable, removable } = splitCycleSelection(
      selectedIssues,
      currentCycleId
    );
    if (addable.length === 0 && removable.length === 0) return undefined;
    return {
      addable: addable.length,
      removable: removable.length,
      onAdd: () => addable.forEach((issue) => onSetCycle(issue, currentCycleId)),
      onRemove: () => removable.forEach((issue) => onSetCycle(issue, null)),
    };
  }, [currentCycleId, onSetCycle, selectedIssues]);
  // A relationship has exactly two ends: the action only exists on two tickets.
  const bulkLink = useMemo(() => {
    if (selectedIssues.length !== 2) return undefined;
    const [first, second] = selectedIssues;
    return () => {
      onAddRelation(first.id, "related", second.id);
      clearSelection();
    };
  }, [selectedIssues, onAddRelation, clearSelection]);
  // Drag it: the embedded package, the deposit marker, and the writing plan
  // — all three come from the same calculation (see lib/use-board-drop.ts).
  const drop = useBoardDrop({
    columns,
    comparator,
    manual: sort === "manual",
    issueMap,
    selectedIds,
  });
  const { preview, draggingIds, activeId } = drop;
  const activeIssue = activeId ? issueMap.get(activeId) ?? null : null;
  const activeParent =
    activeIssue?.parent_id ? issueMap.get(activeIssue.parent_id) ?? null : null;

  // MouseSensor (not PointerSensor) so drag-and-drop is mouse-only: on touch the
  // board is a swipeable stack of full-width columns and DnD would fight the
  // scroll, so touch never starts a drag (status changes go through the card →
  // side panel instead). Desktop mouse drag is unchanged.
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: BOARD_MOUSE_ACTIVATION_DISTANCE },
    })
  );

  // Fade the left/right edges of the board while more columns lie off-screen.
  const { ref: fadeRef, scrollProps, edges } = useScrollFade<HTMLDivElement>("x");

  // Mobile: track which column is snapped into view to drive the dot indicator.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const cardAnimations = useBoardCardAnimations(scrollerRef, columns);
  const setScrollerRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollerRef.current = node;
      fadeRef(node);
      marqueeRef(node);
    },
    [fadeRef, marqueeRef]
  );
  const [activeColumn, setActiveColumn] = useState(0);
  const columnCount = columns.length;

  const updateActiveColumn = useCallback(
    (el: HTMLDivElement) => {
      // The pastilles are `sm:hidden` (see `ColumnDots`): above 640 px
      // there is nothing to show, and above all nothing to put into STATUS —
      // `setActiveColumn` re-returns the entire board, therefore all its cards, to
      // each column threshold crossing during scrolling
      // horizontal (MIN-317). The immediate neighbor has already been fixed for this
      // exact pattern: `scrollProps.onScroll` (lib/use-scroll-fade.ts), whose
      // comment says it "blew the whole interface".
      if (window.innerWidth >= 640) {
        setActiveColumn((prev) => (prev === 0 ? prev : 0));
        return;
      }
      if (el.scrollWidth <= el.clientWidth + 1) {
        setActiveColumn((prev) => (prev === 0 ? prev : 0));
        return;
      }
      const stride = el.scrollWidth / columnCount;
      const idx = Math.min(
        columnCount - 1,
        Math.max(0, Math.round(el.scrollLeft / stride))
      );
      setActiveColumn((prev) => (prev === idx ? prev : idx));
    },
    [columnCount]
  );

  const scrollToColumn = useCallback((index: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    // The scroller's direct children are exactly the columns.
    const stride = el.scrollWidth / (el.children.length || 1);
    el.scrollTo({ left: index * stride, behavior: "smooth" });
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    cardAnimations.measure();
    drop.start(event);
  };
  const handleDragMove = (event: DragMoveEvent) => drop.track(event);

  const handleDragEnd = (event: DragEndEvent) => {
    // The marker already showed THIS plan: we write it as is (MIN-75 for the
    // package, `previewBoardMove` for place).
    const planned = drop.plan(event);
    if (planned) {
      // Refresh after any drag autoscroll so displaced cards animate from the
      // positions visible at the exact moment of release.
      cardAnimations.measure();
      cardAnimations.skipNext([String(event.active.id)]);
    }
    drop.end();
    if (!planned) return;

    void Promise.all(
      planned.moves.map((m) => onMove(m.issue.id, m.patch))
    ).catch((err) => toast.error((err as Error).message));
  };

  return (
    <AgentActivityProvider projectId={projectId}>
    {/* “@” on hovering over a card (or on selection) opens Numo — same
 context as the Numo button on the selection pill (MIN-105). */}
    <AskNumoProvider selectedIssues={selectedIssues} onAskNumo={onAskNumo}>
    <DndContext
      sensors={sensors}
      collisionDetection={boardCollision}
      onDragStart={handleDragStart}
      // `onDragMove` and not only `onDragOver`: the side of the deposit (before or
      // after the hovered map) changes WITHOUT the target changing, and it is
      // exactly what the marker should follow.
      onDragMove={handleDragMove}
      onDragOver={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={drop.end}
    >
      <div className="flex h-full flex-col">
        {/* Mobile: dots reflect / control the snapped column (one status per swipe). */}
        {selectedIssues.length > 0 && (
          <BulkIssueActions
            count={selectedIssues.length}
            members={members}
            onUpdate={updateSelected}
            onDelete={onDeleteIssue ? async () => {
              await Promise.all(selectedIssues.map((issue) => onDeleteIssue(issue.id)));
              clearSelection();
            } : undefined}
            onClear={clearSelection}
            onAskNumo={() => onAskNumo(selectedIssues)}
            cycle={bulkCycle}
            // Project board: the selection is single-project per construction,
            // therefore all its objectives are proposed.
            objectives={objectives}
            onLink={bulkLink}
          />
        )}
        <ColumnDots
          statuses={columns.map((c) => c.status)}
          active={activeColumn}
          onSelect={scrollToColumn}
        />
        {/* The edge fade is drawn NEXT to the scroller (MIN-319): a
 `mask-image` placed on top makes it re-composite with each frame of
 scrolling — and here it was a mask INSIDE a mask,
 since each column carried one too. Hence this parent
 `relative`, and the absence of `scrollProps.style` on the scroller. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={setScrollerRef}
            onScroll={(e) => {
              scrollProps.onScroll();
              updateActiveColumn(e.currentTarget);
            }}
            onPointerDown={onMarqueePointerDown}
            className={cn("min-h-0 flex-1", BOARD_SCROLLER_CLASS)}
          >
            {columns.map(({ status, items }) => (
              <KanbanColumn
                key={status.value}
                status={status}
                issues={items}
                issueMap={issueMap}
                relationsByIssue={relationsByIssue}
                getCandidateIssues={getCandidateIssues}
                projectId={projectId}
                projectKey={projectKey}
                memberMap={memberMap}
                categoryMap={categoryMap}
                objectiveMap={objectiveMap}
                onOpenIssue={onOpenIssue}
                onOpenIssueById={onOpenIssueById}
                onOpenPlan={onOpenPlan}
                onCreateIssue={onCreateIssue}
                onUpdateIssue={onUpdateIssue}
                onSetCategories={onSetCategories}
                onAddRelation={onAddRelation}
                onDeleteIssue={onDeleteIssue}
                buildMenuActions={buildMenuActions}
                currentCycleId={currentCycleId}
                selectedIds={selectedIds}
                draggingIds={draggingIds}
                dropPreview={
                  preview?.status === status.value ? preview : undefined
                }
                onSelect={toggleSelection}
              />
            ))}
          </div>
          <ScrollFadeEdges edges={edges} axis="x" />
        </div>
      </div>

      <MarqueeOverlay overlayRef={marqueeOverlayRef} />

      {/* The custom animation measures the optimistic destination after the
          move, then lands this fixed overlay there. The journey therefore stays
          visible between columns instead of being clipped by either scroller. */}
      <DragOverlay dropAnimation={BOARD_DROP_ANIMATION}>
        {activeIssue ? (
          <div className="relative w-[21rem]">
            {/* The package is not visible in the cursor: the account says so. */}
            {draggingIds.size > 1 && (
              <span className="absolute -right-2 -top-2 z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground shadow-md">
                {draggingIds.size}
              </span>
            )}
            <IssueCardBody
              issue={activeIssue}
              projectKey={projectKey}
              memberMap={memberMap}
              categoryMap={categoryMap}
              objectiveMap={objectiveMap}
              parentNumber={activeParent?.number}
              relations={relationsByIssue.get(activeIssue.id)}
              inCurrentCycle={
                !!currentCycleId && activeIssue.cycle_id === currentCycleId
              }
              dragging
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
    </AskNumoProvider>
    </AgentActivityProvider>
  );
}

/**
 * Mobile-only pagination dots for the swipeable board: one dot per status column,
 * the active one widened. Tapping a dot scrolls that column into view. Hidden
 * when there's only one column.
 *
 * `sm:hidden` and not `desktop:hidden` (MIN-293): these points count PAGES,
 * and there is only one page per column below 640 px, where one column
 * fills the window (`BOARD_COLUMN_CLASS`). Above, two or three columns
 * hold together, a page is no longer a column — the points would start counting wrong, and the last ones would be unreachable. What remains outside
 * field is then read at the faded edges (`useScrollFade`).
 */
function ColumnDots({
  statuses,
  active,
  onSelect,
}: {
  statuses: StatusMeta[];
  active: number;
  onSelect: (index: number) => void;
}) {
  const ts = useTranslations("Status");
  if (statuses.length <= 1) return null;
  return (
    <div className="flex shrink-0 items-center justify-center gap-1.5 pb-2 sm:hidden">
      {statuses.map((status, i) => (
        <button
          key={status.value}
          type="button"
          aria-label={ts(status.value)}
          aria-current={i === active}
          onClick={() => onSelect(i)}
          className={cn(
            "h-1.5 rounded-full transition-all",
            i === active ? "w-4 bg-foreground" : "w-1.5 bg-muted-foreground/30"
          )}
        />
      ))}
    </div>
  );
}
