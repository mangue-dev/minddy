"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  memo,
  useMemo,
  useRef,
  useState,
} from "react";
import { BoardColumnDots } from "@/components/board-column-dots";
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
  SortDirection,
  ViewSort,
} from "@/lib/types";
import { resolveDisplayRelationsByIssue } from "@/lib/relation-constants";
import { cycleBlockingRelations } from "@/lib/cycle";
import { issueIdentifier } from "@/lib/issue-constants";
import { promptRelations } from "@/lib/issue-prompt";
import { useBulkSelectionActions } from "@/lib/use-bulk-selection-actions";
import type { RelationKinds } from "@/lib/use-issue-relations-query";
import { boardComparatorFactory } from "@/lib/smart-triage";
import { createBoardColumnsBuilder } from "@/lib/board-columns";
import {
  BOARD_MOUSE_ACTIVATION_DISTANCE,
  boardCollision,
  captureBoardDragPreview,
  createBoardBoundsModifier,
  createBoardDropAnimation,
  measureBoardDragBounds,
  measureBoardDropBundleHeight,
  measureBoardDropVisualTarget,
  type BoardDragBounds,
} from "@/lib/board-dnd";
import { useBoardDrop } from "@/lib/use-board-drop";
import { useBoardCardAnimations } from "@/lib/use-board-card-animations";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { BOARD_SCROLLER_CLASS } from "@/lib/board-layout";
import { ScrollFadeEdges } from "@/components/scroll-fade-edges";
import { KanbanColumn } from "@/components/kanban-column";
import type { BoardLandingPreview } from "@/components/board-drop-indicator";
import { AgentActivityProvider } from "@/components/agent/agent-activity-context";
import { BulkIssueActions } from "@/components/bulk-issue-actions";
import { AskNumoProvider } from "@/lib/ask-numo-context";
import {
  MarqueeOverlay,
  useMarqueeSelection,
} from "@/components/marquee-selection";
import { splitCycleSelection } from "@/components/cycle/use-cycle-menu-actions";
import type { ContextMenuAction } from "@/components/issue-context-menu";
import {
  restoreBoardScroll,
  type BoardScrollPosition,
} from "@/lib/board-scroll";

export const KanbanBoard = memo(function KanbanBoard({
  issues,
  allIssues,
  relations,
  statuses,
  sort,
  sortDirection,
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
  horizontalScroll,
}: {
  issues: Issue[];
  /** Every project issue (unfiltered) — resolves relation targets that a view
      filter hides from the board, and feeds the "add relation" picker. */
  allIssues: Issue[];
  relations: IssueRelation[];
  statuses: StatusMeta[];
  sort: ViewSort;
  /** Direction of the sort (MIN-592) — reversed by the invert button for the
      directional sorts; ignored by "smart" and "manual". */
  sortDirection?: SortDirection;
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
    targetId: string,
    kinds?: RelationKinds,
  ) => void;
  onMove: (
    issueId: string,
    patch: { status?: IssueStatus; position: number },
  ) => Promise<void>;
  /** Per-issue extra right-click actions (cycle add/remove — MIN-32). */
  buildMenuActions?: (issue: Issue) => ContextMenuAction[];
  /** My current cycle's id — its cards show the blue cycle icon. */
  currentCycleId?: string | null;
  /** Moves one issue in/out of the cycle — same handler as the right-click
      action, reused by the selection's bulk cycle rows. */
  onSetCycle?: (issue: Issue, cycleId: string | null) => void;
  /** Shared with the loading shell so replacing it does not reset the board. */
  horizontalScroll?: BoardScrollPosition;
}) {
  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.user_id, m])),
    [members],
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const objectiveMap = useMemo(
    () => new Map((objectives ?? []).map((o) => [o.id, o])),
    [objectives],
  );
  const issueMap = useMemo(
    () => new Map(issues.map((i) => [i.id, i])),
    [issues],
  );
  // Relation targets resolve against ALL issues (a view filter may hide the
  // other end of a relation from the board).
  const allIssueMap = useMemo(
    () => new Map(allIssues.map((i) => [i.id, i])),
    [allIssues],
  );
  const candidateIssuesRef = useRef(allIssues);
  candidateIssuesRef.current = allIssues;
  const getCandidateIssues = useCallback(() => candidateIssuesRef.current, []);
  const relationsByIssue = useMemo(() => resolveDisplayRelationsByIssue(
    relations ?? [], allIssueMap, objectiveMap,
  ), [relations, allIssueMap, objectiveMap]);

  const buildColumns = useMemo(() => createBoardColumnsBuilder(), []);
  // The smart sort's relations resolve against ALL issues (a filter may
  // hide the other end) and fold objective-ended "blocks" edges onto the
  // objective's open tickets — the same preparation the server reorder
  // applies, so a ticket blocked through its objective still sinks (MIN-576
  // review). An edge whose end is unknown here is not a dependency: the end
  // is trashed or foreign — the rules ignore it rather than act on a
  // guessed "open".
  const triageContext = useMemo(() => {
    const statusById = new Map(
      Array.from(allIssueMap.values(), (i) => [i.id, i.status] as const),
    );
    const issuesByObjective = new Map<string, string[]>();
    for (const issue of allIssues) {
      if (!issue.objective_id) continue;
      const list = issuesByObjective.get(issue.objective_id);
      if (list) list.push(issue.id);
      else issuesByObjective.set(issue.objective_id, [issue.id]);
    }
    const { relations: folded, objectiveStatuses } = cycleBlockingRelations(
      relations,
      issuesByObjective,
      new Map(objectives.map((o) => [o.id, o.status])),
    );
    for (const [id, status] of objectiveStatuses) statusById.set(id, status);
    return {
      relations: folded.filter(
        (r) =>
          r.type !== "blocks" ||
          (statusById.has(r.source_id) && statusById.has(r.target_id)),
      ),
      statusById,
    };
  }, [relations, allIssues, objectives, allIssueMap]);
  const makeComparator = useMemo(
    () =>
      boardComparatorFactory(
        sort,
        {
          relations: triageContext.relations,
          statusById: triageContext.statusById,
        },
        sortDirection ?? "asc"
      ),
    [sort, sortDirection, triageContext],
  );
  const columns = useMemo(
    () => buildColumns(statuses, issues, makeComparator),
    [buildColumns, issues, statuses, makeComparator],
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
    [issues, selectedIds],
  );
  const updateSelected = useCallback(
    (patch: IssueUpdateInput) => {
      selectedIssues.forEach((issue) => onUpdateIssue(issue.id, patch));
    },
    [onUpdateIssue, selectedIssues],
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
      currentCycleId,
    );
    if (addable.length === 0 && removable.length === 0) return undefined;
    return {
      addable: addable.length,
      removable: removable.length,
      onAdd: () =>
        addable.forEach((issue) => onSetCycle(issue, currentCycleId)),
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
  // ⇧P/⇧A on the selection (MIN-539): ONE combined prompt for all the checked
  // tickets, copied to the clipboard or handed to Numo. The selection
  // outranks the hovered card — the same precedence “@” follows.
  const bulkPromptActions = useBulkSelectionActions({
    selectedIssues,
    projectId,
    identifierOf: (issue) => issueIdentifier(projectKey, issue.number),
    buildInput: (issue) => ({
      issue,
      projectId,
      projectKey,
      resourceCount: issue.resource_count,
      categories: issue.category_ids
        .map((cid) => categoryMap.get(cid)?.name)
        .filter((name): name is string => !!name),
      relations: promptRelations(relationsByIssue.get(issue.id), {
        identifierOf: (otherId) =>
          issueIdentifier(projectKey, allIssueMap.get(otherId)?.number ?? 0),
        titleOf: (otherId) =>
          objectiveMap.get(otherId)?.name ?? allIssueMap.get(otherId)?.title ?? "",
      }),
    }),
    onUpdateIssue: (issue, patch) => onUpdateIssue(issue.id, patch),
  });
  // The dragged bundle, drop marker, and persisted move all come from the same
  // calculation (see lib/use-board-drop.ts).
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const drop = useBoardDrop({
    root: scrollerRef,
    columns,
    makeComparator,
    manual: sort === "manual",
    issueMap,
    selectedIds,
  });
  const { preview, draggingIds, activeId } = drop;
  const [landingPreview, setLandingPreview] =
    useState<BoardLandingPreview | null>(null);
  const isLanding = landingPreview !== null;
  const dragPreviewHtmlRef = useRef<string | null>(null);
  const dragBoundsRef = useRef<BoardDragBounds | null>(null);
  const dragBoundsModifier = useMemo(
    () => createBoardBoundsModifier(dragBoundsRef),
    [],
  );
  const dragModifiers = useMemo(
    () => [dragBoundsModifier],
    [dragBoundsModifier],
  );

  // MouseSensor (not PointerSensor) so drag-and-drop is mouse-only: on touch the
  // board is a swipeable stack of full-width columns and DnD would fight the
  // scroll, so touch never starts a drag (status changes go through the card →
  // side panel instead). Desktop mouse drag is unchanged.
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: BOARD_MOUSE_ACTIVATION_DISTANCE },
    }),
  );

  // Fade the left/right edges of the board while more columns lie off-screen.
  const {
    ref: fadeRef,
    scrollProps,
    edges,
  } = useScrollFade<HTMLDivElement>("x");

  // Mobile: track which column is snapped into view to drive the dot indicator.
  const localHorizontalScroll = useRef(0);
  const preservedHorizontalScroll = horizontalScroll ?? localHorizontalScroll;
  const dropAnimation = useMemo(() => createBoardDropAnimation(() => scrollerRef.current), []);
  const landingGenerationRef = useRef(0);
  const setScrollerRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollerRef.current = node;
      fadeRef(node);
      marqueeRef(node);
    },
    [fadeRef, marqueeRef],
  );

  useLayoutEffect(() => {
    const node = scrollerRef.current;
    if (node) restoreBoardScroll(node, preservedHorizontalScroll);
  }, [columns, preservedHorizontalScroll]);

  // Scroll restoration must run before the FLIP hook reads viewport geometry.
  const cardAnimations = useBoardCardAnimations(
    scrollerRef,
    columns,
    activeId !== null,
    landingPreview,
  );
  useLayoutEffect(() => {
    dropAnimation.layoutCommitted((id) => issueMap.get(id) ?? null);
  }, [columns, dropAnimation, issueMap]);
  useEffect(
    () => () => {
      landingGenerationRef.current += 1;
      dropAnimation.cancel();
    },
    [dropAnimation],
  );

  const handleDragStart = (event: DragStartEvent) => {
    landingGenerationRef.current += 1;
    dropAnimation.cancel();
    cardAnimations.cancel();
    setLandingPreview(null);
    dragPreviewHtmlRef.current = captureBoardDragPreview(
      String(event.active.id),
      scrollerRef.current,
    );
    dragBoundsRef.current = measureBoardDragBounds(scrollerRef.current);
    drop.start(event);
  };
  const pendingTrackRef = useRef<DragMoveEvent | null>(null);
  const trackFrameRef = useRef<number | null>(null);
  const cancelPendingTrack = useCallback(() => {
    pendingTrackRef.current = null;
    if (trackFrameRef.current != null) {
      cancelAnimationFrame(trackFrameRef.current);
      trackFrameRef.current = null;
    }
  }, []);
  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      pendingTrackRef.current = event;
      if (trackFrameRef.current != null) return;
      trackFrameRef.current = requestAnimationFrame(() => {
        trackFrameRef.current = null;
        const latest = pendingTrackRef.current;
        pendingTrackRef.current = null;
        if (latest) drop.track(latest);
      });
    },
    [drop],
  );
  useEffect(() => cancelPendingTrack, [cancelPendingTrack]);

  const handleDragEnd = (event: DragEndEvent) => {
    cancelPendingTrack();
    // Persist the exact move plan already represented by the marker (MIN-75).
    const planned = drop.plan(event);
    const draggedId = String(event.active.id);
    const activeMove = planned?.moves.find(
      (move) => move.issue.id === draggedId,
    );
    if (activeMove) {
      cardAnimations.measure();
      cardAnimations.skipNext(draggingIds);
      const destinationStatus =
        activeMove.patch.status ?? activeMove.issue.status;
      const visualTarget = measureBoardDropVisualTarget({
        root: scrollerRef.current,
        activeId: draggedId,
        activeIds: draggingIds,
        bounds: dragBoundsRef.current,
        status: destinationStatus,
      });
      const bundleHeight = measureBoardDropBundleHeight({
        root: scrollerRef.current,
        activeIds: draggingIds,
        status: destinationStatus,
      });
      const nextLanding =
        preview && preview.status === destinationStatus && bundleHeight != null
          ? {
              ...preview,
              activeIds: new Set(draggingIds),
              height: bundleHeight,
            }
          : null;
      const generation = ++landingGenerationRef.current;
      setLandingPreview(nextLanding);
      dropAnimation.prepare(
        {
          activeId: draggedId,
          position: activeMove.patch.position,
          status: destinationStatus,
          visualTarget,
        },
        () => {
          cardAnimations.unskip(draggingIds);
          if (landingGenerationRef.current === generation) {
            setLandingPreview(null);
          }
        },
      );
    }
    drop.end();
    if (!planned) return;

    void Promise.all(
      planned.moves.map((m) => onMove(m.issue.id, m.patch)),
    ).catch((err) => toast.error((err as Error).message));
  };

  const handleDragCancel = () => {
    cancelPendingTrack();
    landingGenerationRef.current += 1;
    dropAnimation.cancel();
    setLandingPreview(null);
    drop.end();
  };

  return (
    <AgentActivityProvider projectId={projectId}>
      {/* “@” on card hover or selection opens Numo with the same context as
          the button on the selection pill (MIN-105). */}
      <AskNumoProvider selectedIssues={selectedIssues} onAskNumo={onAskNumo}>
        <DndContext
          sensors={sensors}
          collisionDetection={boardCollision}
          onDragStart={handleDragStart}
          // The drop side can change without the target changing, so the marker
          // must track `onDragMove` as well as `onDragOver`.
          onDragMove={handleDragMove}
          onDragOver={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="flex h-full flex-col">
            {selectedIssues.length > 0 && (
              <BulkIssueActions
                count={selectedIssues.length}
                members={members}
                onUpdate={updateSelected}
                onDelete={
                  onDeleteIssue
                    ? async () => {
                        await Promise.all(
                          selectedIssues.map((issue) =>
                            onDeleteIssue(issue.id),
                          ),
                        );
                        clearSelection();
                      }
                    : undefined
                }
                onClear={clearSelection}
                onAskNumo={() => onAskNumo(selectedIssues)}
                onCopyPrompt={() => void bulkPromptActions.copyPrompt()}
                onLaunchAgent={bulkPromptActions.launchAgent}
                cycle={bulkCycle}
                // A project-board selection always belongs to one project, so
                // all of that project's objectives are available.
                objectives={objectives}
                onLink={bulkLink}
              />
            )}
            {/* Draw the edge fade beside the scroller (MIN-319). A mask on the
                scroller would be recomposited on every frame and nested inside
                each column's mask. The relative parent anchors the fade. */}
            <div className="relative flex min-h-0 flex-1 flex-col">
              <div
                ref={setScrollerRef}
                onScroll={(e) => {
                  preservedHorizontalScroll.current =
                    e.currentTarget.scrollLeft;
                  scrollProps.onScroll();
                }}
                onPointerDown={onMarqueePointerDown}
                style={isLanding ? { scrollSnapType: "none" } : undefined}
                className={cn("mobile-kanban-scroller min-h-0 flex-1", BOARD_SCROLLER_CLASS)}
              >
                {columns.map(({ status, items }) => (
                  <KanbanColumn
                    key={status.value}
                    status={status}
                    issues={items}
                    issueMap={allIssueMap}
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
                    landingPreview={landingPreview ?? undefined}
                    onSelect={toggleSelection}
                  />
                ))}
              </div>
              <ScrollFadeEdges edges={edges} axis="x" className="z-30" />
            </div>
            <BoardColumnDots statuses={columns.map((column) => column.status)} scroller={scrollerRef} />
          </div>

          <MarqueeOverlay overlayRef={marqueeOverlayRef} />

          {/* The custom animation measures the optimistic destination after the
          move, then lands this fixed overlay there. The journey therefore stays
          visible between columns instead of being clipped by either scroller. */}
          <DragOverlay
            dropAnimation={dropAnimation.animation}
            modifiers={dragModifiers}
            style={{ pointerEvents: "none" }}
            zIndex={20}
          >
            {activeId && dragPreviewHtmlRef.current ? (
              <div className="relative w-full">
                {/* The badge represents the rest of a multi-card bundle. */}
                {draggingIds.size > 1 && (
                  <span className="absolute -right-2 -top-2 z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground shadow-md">
                    {draggingIds.size}
                  </span>
                )}
                <div
                  aria-hidden
                  dangerouslySetInnerHTML={{
                    __html: dragPreviewHtmlRef.current,
                  }}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </AskNumoProvider>
    </AgentActivityProvider>
  );
});
