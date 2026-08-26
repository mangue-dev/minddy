"use client";

import { useCallback, useMemo, useRef, useState } from "react";
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
  Project,
  ViewSort,
} from "@/lib/types";
import { issueComparator } from "@/lib/view-filter";
import { resolveRelationsByIssue } from "@/lib/relation-constants";
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
import { GlobalKanbanColumn } from "@/components/global-kanban-column";
import { AgentActivityProvider } from "@/components/agent/agent-activity-context";
import { BulkIssueActions } from "@/components/bulk-issue-actions";
import { AskNumoProvider } from "@/lib/ask-numo-context";
import {
  MarqueeOverlay,
  useMarqueeSelection,
} from "@/components/marquee-selection";
import { splitCycleSelection } from "@/components/cycle/use-cycle-menu-actions";
import { IssueCardBody } from "@/components/issue-card";
import type { ChipRelation } from "@/components/relation-chips";
import type { ContextMenuAction } from "@/components/issue-context-menu";

const EMPTY_MEMBERS: Map<string, Member> = new Map();
const EMPTY_CATEGORIES: Map<string, Category> = new Map();
const EMPTY_OBJECTIVES: Map<string, Objective> = new Map();

/**
 * The cross-project kanban's drag-and-drop surface (MIN-29) — the same DnD model
 * as <KanbanBoard>: drag a card between columns to change its status, or reorder
 * within a column under manual sort. Positions are computed among the board's
 * (cross-project) column items; the touched issue's project id rides along so
 * the write targets the right project cache. No relations/create here.
 */
export function GlobalKanbanBoard({
  issues,
  allIssues,
  relations,
  statuses,
  sort,
  projectMap,
  memberMapByProject,
  categoryMapByProject,
  objectiveMapByProject,
  onOpenIssue,
  onOpenIssueById,
  onOpenPlan,
  onUpdateIssue,
  onDeleteIssue,
  onAskNumo,
  onSetCategories,
  onMove,
  onCreateIssue,
  onAddRelation,
  comparator,
  buildMenuActions,
  currentCycleId,
  bulkCycleId,
  onSetCycle,
  readOnly = false,
}: {
  issues: Issue[];
  /** Every board issue (unfiltered, all projects) — resolves relation targets
      hidden by the view/cycle scope, and feeds the "add relation" picker. */
  allIssues?: Issue[];
  /** Stored relation rows across my projects — the cards' chips (MIN-25). */
  relations?: IssueRelation[];
  statuses: StatusMeta[];
  sort: ViewSort;
  projectMap: Map<string, Project>;
  memberMapByProject: Map<string, Map<string, Member>>;
  categoryMapByProject: Map<string, Map<string, Category>>;
  objectiveMapByProject: Map<string, Map<string, Objective>>;
  onOpenIssue: (issue: Issue) => void;
  /** Opens a related issue's side panel (clicking a relation chip). */
  onOpenIssueById?: (issueId: string) => void;
  onOpenPlan: (issue: Issue) => void;
  onUpdateIssue: (issueId: string, patch: IssueUpdateInput, projectId: string) => void;
  onDeleteIssue: (issueId: string, projectId: string) => Promise<void>;
  onAskNumo: (issues: Issue[]) => void;
  onSetCategories: (issueId: string, ids: string[], projectId: string) => void;
  onMove: (
    issueId: string,
    patch: { status?: IssueStatus; position: number },
    projectId: string
  ) => Promise<void>;
  /** Open the app-wide create dialog preset to a column's status (MIN-33).
      Absent → the columns render no "new issue" footer (cycle mode). */
  onCreateIssue?: (status: IssueStatus) => void;
  /** Adds a relation from a card (right-click). Relations are same-project by
      construction — the card's project id rides along for the API route. */
  onAddRelation?: (
    sourceId: string,
    type: IssueRelationType,
    targetId: string,
    projectId: string
  ) => void;
  /** Cycle mode (MIN-32): the reco order replaces `sort` — the ONLY order, so
      same-column reordering is disabled; cross-column drag still moves status. */
  comparator?: (a: Issue, b: Issue) => number;
  /** Per-issue extra right-click actions (cycle add/remove — MIN-32). */
  buildMenuActions?: (issue: Issue) => ContextMenuAction[];
  /** My current cycle's id — cards in it show the blue cycle icon. Unset in
      cycle view, where the icon would be pure noise. */
  currentCycleId?: string | null;
  /** The cycle the SELECTION's bulk moves target. Same as `currentCycleId` on a
      normal board; set on its own in cycle view, where the badge is suppressed
      (every card is in the cycle) but bulk removal is exactly what's wanted. */
  bulkCycleId?: string | null;
  /** Moves one issue in/out of the cycle — same handler as the right-click
      action, reused by the selection's bulk cycle rows. */
  onSetCycle?: (issue: Issue, cycleId: string | null) => void;
  /** Past/future cycles are read-only: no drag at all. */
  readOnly?: boolean;
}) {
  const issueMap = useMemo(
    () => new Map(issues.map((i) => [i.id, i])),
    [issues]
  );

  // Relation resolution + picker candidates work on the FULL board (the other
  // end of a relation may be outside the current view/cycle scope).
  const allIssueMap = useMemo(
    () => new Map((allIssues ?? issues).map((i) => [i.id, i])),
    [allIssues, issues]
  );
  const issuesByProject = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const i of allIssues ?? issues) {
      const list = map.get(i.project_id);
      if (list) list.push(i);
      else map.set(i.project_id, [i]);
    }
    return map;
  }, [allIssues, issues]);
  const issuesByProjectRef = useRef(issuesByProject);
  issuesByProjectRef.current = issuesByProject;
  const getCandidateIssues = useCallback(
    (projectId: string) => issuesByProjectRef.current.get(projectId),
    []
  );
  const relationsByIssue = useMemo(() => {
    const map = new Map<string, ChipRelation[]>();
    if (!relations?.length) return map;
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

  const displayComparator = useMemo(
    () => comparator ?? issueComparator(sort),
    [comparator, sort]
  );
  const buildColumns = useMemo(() => createBoardColumnsBuilder(), []);
  const columns = useMemo(
    () => buildColumns(statuses, issues, displayComparator),
    [buildColumns, issues, statuses, displayComparator]
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
  const selectedIssues = useMemo(() => issues.filter((issue) => selectedIds.has(issue.id)), [issues, selectedIds]);
  const updateSelected = useCallback((patch: IssueUpdateInput) => {
    selectedIssues.forEach((issue) => onUpdateIssue(issue.id, patch, issue.project_id));
  }, [onUpdateIssue, selectedIssues]);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  // Lasso on the bottom of the board — same hook, same selection as the project board.
  const {
    ref: marqueeRef,
    onPointerDown: onMarqueePointerDown,
    overlayRef: marqueeOverlayRef,
  } = useMarqueeSelection<HTMLDivElement>({
    selected: selectedIds,
    onChange: setSelectedIds,
  });
  // Objectives and relationships are specific to a project: grouped actions which
  // depend on it only exist if ALL the selection fits in the same one.
  const selectionProjectId = useMemo(() => {
    if (selectedIssues.length === 0) return null;
    const first = selectedIssues[0].project_id;
    return selectedIssues.every((i) => i.project_id === first) ? first : null;
  }, [selectedIssues]);
  const bulkObjectives = useMemo(() => {
    if (!selectionProjectId) return undefined;
    const map = objectiveMapByProject.get(selectionProjectId);
    return map ? Array.from(map.values()) : undefined;
  }, [selectionProjectId, objectiveMapByProject]);
  const cycleTargetId = bulkCycleId ?? currentCycleId ?? null;
  const bulkCycle = useMemo(() => {
    if (!cycleTargetId || !onSetCycle) return undefined;
    const { addable, removable } = splitCycleSelection(
      selectedIssues,
      cycleTargetId
    );
    if (addable.length === 0 && removable.length === 0) return undefined;
    return {
      addable: addable.length,
      removable: removable.length,
      onAdd: () => addable.forEach((issue) => onSetCycle(issue, cycleTargetId)),
      onRemove: () => removable.forEach((issue) => onSetCycle(issue, null)),
    };
  }, [cycleTargetId, onSetCycle, selectedIssues]);
  // A relationship has exactly two ends: action only exists at two ends.
  const bulkLink = useMemo(() => {
    if (selectedIssues.length !== 2 || !selectionProjectId || !onAddRelation) {
      return undefined;
    }
    const [first, second] = selectedIssues;
    return () => {
      onAddRelation(first.id, "related", second.id, selectionProjectId);
      clearSelection();
    };
  }, [selectedIssues, selectionProjectId, onAddRelation, clearSelection]);
  // Drag it: embedded package, deposit marker and writing plan, of the same
  // calculation as the project board (see lib/use-board-drop.ts).
  const drop = useBoardDrop({
    columns,
    comparator: displayComparator,
    manual: sort === "manual",
    issueMap,
    selectedIds,
    // Cycle view: the receipt order is the only one, therefore no reordering
    // in a column — only the status change passes.
    crossColumnOnly: !!comparator,
  });
  const { preview, draggingIds, activeId } = drop;
  const activeIssue = activeId ? issueMap.get(activeId) ?? null : null;
  const activeProject = activeIssue
    ? projectMap.get(activeIssue.project_id)
    : undefined;
  const activeParent =
    activeIssue?.parent_id ? issueMap.get(activeIssue.parent_id) ?? null : null;

  // Mouse-only drag (touch scrolls the swipeable columns) — mirrors KanbanBoard.
  // Read-only boards (past/future cycles) get a huge activation distance so the
  // sensor never fires — hooks must run unconditionally.
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: readOnly
          ? Number.MAX_SAFE_INTEGER
          : BOARD_MOUSE_ACTIVATION_DISTANCE,
      },
    })
  );

  // Fade the left/right edges of the board while more columns lie off-screen
  // — same affordance as the project board.
  const { ref: fadeRef, scrollProps, edges } = useScrollFade<HTMLDivElement>("x");

  // The edge fade and lasso want the same knot. Memorized fusion: one
  // new identity with each render would cause them to detach and then reattach.
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

  const handleDragStart = (event: DragStartEvent) => {
    cardAnimations.measure();
    drop.start(event);
  };
  const handleDragMove = (event: DragMoveEvent) => drop.track(event);

  const handleDragEnd = (event: DragEndEvent) => {
    // The marker already showed THIS plan: we write it as is.
    const planned = drop.plan(event);
    if (planned) {
      cardAnimations.measure();
      cardAnimations.skipNext([String(event.active.id)]);
    }
    drop.end();
    if (!planned) return;

    void Promise.all(
      planned.moves.map((m) => onMove(m.issue.id, m.patch, m.issue.project_id))
    ).catch((err) => toast.error((err as Error).message));
  };

  return (
    // Halo “agent in progress” on cross-project maps: the provider receives
    // every project displayed by this board.
    <AgentActivityProvider projectIds={[...projectMap.keys()]}>
    {/* “@” when hovering over a card (or on selection) opens Numo — even
 context as the Numo button of the selection pill (MIN-105). */}
    <AskNumoProvider selectedIssues={selectedIssues} onAskNumo={onAskNumo}>
    <DndContext
      sensors={sensors}
      collisionDetection={boardCollision}
      onDragStart={handleDragStart}
      // The side of the deposit changes without the target changing: this is `onDragMove`
      // who sees it, not `onDragOver` (see KanbanBoard).
      onDragMove={handleDragMove}
      onDragOver={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={drop.end}
    >
      {selectedIssues.length > 0 && (
        <BulkIssueActions
          count={selectedIssues.length}
          members={Array.from(memberMapByProject.values()).flatMap((members) => Array.from(members.values()))}
          onUpdate={updateSelected}
          onDelete={async () => {
            await Promise.all(selectedIssues.map((issue) => onDeleteIssue(issue.id, issue.project_id)));
            clearSelection();
          }}
          onClear={clearSelection}
          onAskNumo={() => onAskNumo(selectedIssues)}
          cycle={bulkCycle}
          objectives={bulkObjectives}
          onLink={bulkLink}
        />
      )}
      {/* Edge fade NEXT to the scroller, not on it (MIN-319). */}
      <div className="relative flex h-full min-h-0 flex-col">
        <div
          ref={setScrollerRef}
          onScroll={scrollProps.onScroll}
          onPointerDown={onMarqueePointerDown}
          className={cn("h-full min-h-0", BOARD_SCROLLER_CLASS)}
        >
          {columns.map(({ status, items }) => (
            <GlobalKanbanColumn
              key={status.value}
              status={status}
              issues={items}
              projectMap={projectMap}
              issueMap={issueMap}
              relationsByIssue={relationsByIssue}
              getCandidateIssues={getCandidateIssues}
              memberMapByProject={memberMapByProject}
              categoryMapByProject={categoryMapByProject}
              objectiveMapByProject={objectiveMapByProject}
              onOpenIssue={onOpenIssue}
              onOpenIssueById={onOpenIssueById}
              onOpenPlan={onOpenPlan}
              onUpdateIssue={onUpdateIssue}
              onSetCategories={onSetCategories}
              onCreateIssue={onCreateIssue}
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

      <MarqueeOverlay overlayRef={marqueeOverlayRef} />

      <DragOverlay dropAnimation={BOARD_DROP_ANIMATION}>
        {activeIssue ? (
          <div className="relative w-[21rem]">
            {/* The package is not visible on the cursor: the account says so. */}
            {draggingIds.size > 1 && (
              <span className="absolute -right-2 -top-2 z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground shadow-md">
                {draggingIds.size}
              </span>
            )}
            <IssueCardBody
              issue={activeIssue}
              projectKey={activeProject?.key ?? ""}
              project={activeProject}
              memberMap={
                memberMapByProject.get(activeIssue.project_id) ?? EMPTY_MEMBERS
              }
              categoryMap={
                categoryMapByProject.get(activeIssue.project_id) ?? EMPTY_CATEGORIES
              }
              objectiveMap={
                objectiveMapByProject.get(activeIssue.project_id) ?? EMPTY_OBJECTIVES
              }
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
