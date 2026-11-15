"use client";

import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type SensorDescriptor,
  type SensorOptions,
} from "@dnd-kit/core";
import { DragCursor } from "@/components/drag-cursor";
import { cn } from "@/lib/utils";
import type { IssueStatus, StatusMeta } from "@/lib/issue-constants";
import type {
  Issue,
  IssueRelation,
  IssueRelationType,
  IssueUpdateInput,
  SortDirection,
  ViewSort,
} from "@/lib/types";
import { resolveDisplayRelationsByIssue } from "@/lib/relation-constants";
import { boardBlockingContext } from "@/lib/cycle";
import { isIssueStatus } from "@/lib/issue-constants";
import { ProjectRolesContext } from "@/lib/projects-context-store";
import { projectCapabilities } from "@/lib/project-roles";
import {
  boardObjectives,
  boardPromptInput,
  selectionProjectId,
  sharedMembers,
  writableSelection,
  type BoardProjects,
} from "@/lib/board-projects";
import { useTranslations } from "next-intl";
import { useBoardCardInstructions, useDragAnnouncements } from "@/lib/use-drag-announcements";
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
import { KanbanColumn, type BoardCardProject } from "@/components/kanban-column";
import type { BoardLandingPreview } from "@/components/board-drop-indicator";
import { IssuePrProvider } from "@/components/issue-pr-context";
import { BulkIssueActions, BulkIssueActionsPresence } from "@/components/bulk-issue-actions";
import { AskNumoProvider } from "@/lib/ask-numo-context";
import { IssueSelectionProvider } from "@/lib/issue-selection-context";
import { useUndoHistory } from "@/lib/undo/undo-context";
import {
  MarqueeOverlay,
  useMarqueeSelection,
} from "@/components/marquee-selection";
import { splitCycleSelection } from "@/components/cycle/use-cycle-menu-actions";
import type { ContextMenuAction } from "@/components/issue-context-menu";
import { useBoardReorderActions } from "@/components/use-board-reorder-actions";
import {
  restoreBoardScroll,
  type BoardScrollPosition,
} from "@/lib/board-scroll";

/** Read-only boards (past cycles) register no sensor, so no drag can start. */
const NO_SENSORS: SensorDescriptor<SensorOptions>[] = [];

/**
 * The kanban of a project board and of the cross-project `/all` board
 * (MIN-29): drag a card between columns to change its status, or reorder
 * within a column under manual sort. Each card is resolved in its own project
 * (`projects`); a project board is the one-project case.
 */
export const KanbanBoard = memo(function KanbanBoard({
  issues,
  allIssues,
  relations,
  statuses,
  sort,
  sortDirection,
  projects,
  onOpenIssue,
  onOpenIssueById,
  onOpenPlan,
  onCreateIssue,
  onUpdateIssue,
  onDeleteIssue,
  onAskNumo,
  onSetCategories,
  onAddRelation,
  onRemoveRelation,
  onMove,
  comparator,
  buildMenuActions,
  currentCycleId,
  bulkCycleId,
  onSetCycle,
  readOnly = false,
  horizontalScroll,
}: {
  issues: Issue[];
  /** Every issue of the board's projects (unfiltered) — resolves relation
      targets that a view filter hides, and feeds the "add relation" picker. */
  allIssues: Issue[];
  relations: IssueRelation[];
  statuses: StatusMeta[];
  sort: ViewSort;
  /** Direction of the sort (MIN-592) — reversed by the invert button for the
      directional sorts; ignored by "smart" and "manual". */
  sortDirection?: SortDirection;
  projects: BoardProjects;
  onOpenIssue: (issue: Issue) => void;
  /** Opens a related issue's side panel (clicking a relation chip). */
  onOpenIssueById?: (issueId: string) => void;
  onOpenPlan: (issue: Issue) => void;
  /** Absent → the columns have no "new issue" slot. */
  onCreateIssue?: (status: IssueStatus) => void;
  onUpdateIssue: (issueId: string, patch: IssueUpdateInput) => void;
  onDeleteIssue?: (issueId: string) => Promise<boolean>;
  onAskNumo: (issues: Issue[]) => void;
  onSetCategories: (issueId: string, ids: string[]) => void;
  onAddRelation?: (
    sourceId: string,
    type: IssueRelationType,
    targetId: string,
    kinds?: RelationKinds,
  ) => void;
  /** Removes a relation from a card's relation popover. */
  onRemoveRelation?: (relationId: string) => void;
  onMove: (issueId: string, patch: { status?: IssueStatus; position: number }) => void;
  /** Cycle mode (MIN-32): the reco order replaces `sort` — the ONLY order, so
      same-column reordering is disabled; cross-column drag still moves status. */
  comparator?: (a: Issue, b: Issue) => number;
  /** Per-issue extra right-click actions (cycle add/remove — MIN-32). */
  buildMenuActions?: (issue: Issue) => ContextMenuAction[];
  /** My current cycle's id — its cards show the blue cycle icon. */
  currentCycleId?: string | null;
  /** The cycle the SELECTION's bulk moves target, when it is not
      `currentCycleId`: the cycle view hides the badge (every card is in the
      cycle) but still offers bulk removal. */
  bulkCycleId?: string | null;
  /** Moves one issue in/out of the cycle — same handler as the right-click
      action, reused by the selection's bulk cycle rows. */
  onSetCycle?: (issue: Issue, cycleId: string | null) => void;
  /** Past cycles are read-only: no drag at all. */
  readOnly?: boolean;
  /** Shared with the loading shell so replacing it does not reset the board. */
  horizontalScroll?: BoardScrollPosition;
}) {
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
  const objectiveMap = useMemo(() => boardObjectives(projects), [projects]);
  const relationsByIssue = useMemo(() => resolveDisplayRelationsByIssue(
    relations, allIssueMap, objectiveMap,
  ), [relations, allIssueMap, objectiveMap]);

  // Project readers (MIN-693) browse their cards but never select them, so
  // the selection's bulk actions only ever edit writable issues.
  const roles = useContext(ProjectRolesContext);
  const canWriteIn = useCallback(
    (projectId: string) =>
      projectCapabilities(roles?.get(projectId)?.role ?? "member").canWrite,
    [roles],
  );

  // The relation picker lists the card's own project only. Its reader is read
  // lazily, so the cards keep their memoization (MIN-316) as issues change.
  const issuesByProject = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const issue of allIssues) {
      const list = map.get(issue.project_id);
      if (list) list.push(issue);
      else map.set(issue.project_id, [issue]);
    }
    return map;
  }, [allIssues]);
  const issuesByProjectRef = useRef(issuesByProject);
  issuesByProjectRef.current = issuesByProject;
  const cardProjects = useMemo(() => {
    const out = new Map<string, BoardCardProject>();
    for (const [id, project] of projects.byId) {
      out.set(id, {
        ...project,
        canWrite: canWriteIn(id),
        getCandidateIssues: () => issuesByProjectRef.current.get(id),
      });
    }
    return out;
  }, [projects, canWriteIn]);

  const buildColumns = useMemo(() => createBoardColumnsBuilder(), []);
  // A fixed comparator (cycle mode) orders every column; otherwise the view
  // sort reads blocking across ALL issues (a filter may hide the other end),
  // objective-ended edges folded onto their tickets (MIN-576).
  const makeComparator = useMemo(() => {
    if (comparator) return () => comparator;
    const context = boardBlockingContext(
      allIssues,
      relations,
      new Map(Array.from(objectiveMap.values(), (o) => [o.id, o.status])),
    );
    return boardComparatorFactory(
      sort,
      {
        relations: context.knownRelations,
        statusById: context.statusById,
        objectiveByIssue: context.objectiveByIssue,
      },
      sortDirection ?? "asc",
    );
  }, [comparator, sort, sortDirection, relations, allIssues, objectiveMap]);
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
  const selectWritable = useCallback(
    (next: Set<string>) => setSelectedIds(writableSelection(next, issueMap, canWriteIn)),
    [issueMap, canWriteIn],
  );
  const selectedIssues = useMemo(
    () =>
      issues.filter(
        (issue) => selectedIds.has(issue.id) && canWriteIn(issue.project_id),
      ),
    [issues, selectedIds, canWriteIn],
  );
  const updateSelected = useCallback(
    (patch: IssueUpdateInput) => {
      selectedIssues.forEach((issue) => onUpdateIssue(issue.id, patch));
    },
    [onUpdateIssue, selectedIssues],
  );
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const { linked } = useUndoHistory();
  // Lasso on the board's background: the same selection as thirty ⇧-clicks in
  // one gesture. The column container is its start surface, bounds and
  // autoscroll area.
  const {
    ref: marqueeRef,
    onPointerDown: onMarqueePointerDown,
    overlayRef: marqueeOverlayRef,
  } = useMarqueeSelection<HTMLDivElement>({
    selected: selectedIds,
    onChange: selectWritable,
  });
  // Objectives and relations belong to a project: the bulk actions that need
  // one exist only while the whole selection is in the same project.
  const selectionProject = useMemo(
    () => selectionProjectId(selectedIssues),
    [selectedIssues],
  );
  const bulkObjectives = useMemo(() => {
    const objectives = selectionProject
      ? projects.byId.get(selectionProject)?.objectives
      : undefined;
    return objectives ? Array.from(objectives.values()) : undefined;
  }, [selectionProject, projects]);
  const bulkMembers = useMemo(
    () => sharedMembers(selectedIssues, projects),
    [selectedIssues, projects],
  );
  // Cycle moves on the selection: an issue already in the cycle can leave it,
  // an open one can join it — a mixed selection offers both.
  const cycleTargetId = bulkCycleId ?? currentCycleId ?? null;
  const bulkCycle = useMemo(() => {
    if (!cycleTargetId || !onSetCycle) return undefined;
    const { addable, removable } = splitCycleSelection(
      selectedIssues,
      cycleTargetId,
    );
    if (addable.length === 0 && removable.length === 0) return undefined;
    return {
      addable: addable.length,
      removable: removable.length,
      onAdd: () => addable.forEach((issue) => onSetCycle(issue, cycleTargetId)),
      onRemove: () => removable.forEach((issue) => onSetCycle(issue, null)),
    };
  }, [cycleTargetId, onSetCycle, selectedIssues]);
  // A relation has exactly two ends: the action only exists on two issues.
  const bulkLink = useMemo(() => {
    if (selectedIssues.length !== 2 || !selectionProject || !onAddRelation) {
      return undefined;
    }
    const [first, second] = selectedIssues;
    return () => {
      onAddRelation(first.id, "related", second.id);
      clearSelection();
    };
  }, [selectedIssues, selectionProject, onAddRelation, clearSelection]);
  // ⇧P on the selection (MIN-539): ONE combined prompt for all the checked
  // tickets, copied to the clipboard or handed to Numo. The selection
  // outranks the hovered card — the same precedence “@” follows.
  const bulkPromptActions = useBulkSelectionActions({
    selectedIssues,
    buildInput: (issue) =>
      boardPromptInput(issue, projects, relationsByIssue.get(issue.id), allIssueMap),
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
    // A fixed order is kept as displayed: only cross-column status changes
    // are persisted.
    crossColumnOnly: !!comparator,
  });
  // The menu's keyboard twin of a reorder drag (WCAG 2.5.7).
  const cardMenuActions = useBoardReorderActions({
    columns,
    enabled: sort === "manual" && !comparator,
    move: async (planned) => onMove(planned.issue.id, planned.patch),
    extra: buildMenuActions,
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

  // Screen readers hear issue titles and column names, not their IDs.
  const tStatus = useTranslations("Status");
  const dragInstructions = useBoardCardInstructions();
  const dragAnnouncements = useDragAnnouncements((id) => {
    const issue = issueMap.get(String(id));
    if (issue) return issue.title;
    return isIssueStatus(id) ? tStatus(id) : null;
  });
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

  // The horizontal position survives the board re-rendering its columns.
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

    // Several cards dragged together undo together (MIN-795).
    linked(() => {
      for (const m of planned.moves) onMove(m.issue.id, m.patch);
    });
  };

  const handleDragCancel = () => {
    cancelPendingTrack();
    landingGenerationRef.current += 1;
    dropAnimation.cancel();
    setLandingPreview(null);
    drop.end();
  };

  return (
    <IssuePrProvider
      projectId={projects.projectId}
      projectIds={projects.projectId ? undefined : [...projects.byId.keys()]}
    >
      {/* “@” on card hover or selection opens Numo with the same context as
          the button on the selection pill (MIN-105). */}
      <AskNumoProvider selectedIssues={selectedIssues} onAskNumo={onAskNumo}>
        {/* A picker on a selected card edits the whole selection (MIN-795). */}
        <IssueSelectionProvider selectedIssues={selectedIssues} relationsByIssue={relationsByIssue} copyActions={bulkPromptActions}>
          <DndContext
            accessibility={{ announcements: dragAnnouncements, screenReaderInstructions: dragInstructions }}
            sensors={readOnly ? NO_SENSORS : sensors}
            collisionDetection={boardCollision}
            onDragStart={handleDragStart}
            // The drop side can change without the target changing, so the marker
            // must track `onDragMove` as well as `onDragOver`.
            onDragMove={handleDragMove}
            onDragOver={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <DragCursor />
            <div className="flex h-full flex-col">
              <BulkIssueActionsPresence>
                {selectedIssues.length > 0 && (
                  <BulkIssueActions
                    key="bulk-actions"
                    count={selectedIssues.length}
                    issues={selectedIssues}
                    members={bulkMembers}
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
                    cycle={bulkCycle}
                    objectives={bulkObjectives}
                    onLink={bulkLink}
                  />
                )}
              </BulkIssueActionsPresence>
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
                      projects={cardProjects}
                      onOpenIssue={onOpenIssue}
                      onOpenIssueById={onOpenIssueById}
                      onOpenPlan={onOpenPlan}
                      onCreateIssue={onCreateIssue}
                      onUpdateIssue={onUpdateIssue}
                      onSetCategories={onSetCategories}
                      onAddRelation={onAddRelation}
                      onRemoveRelation={onRemoveRelation}
                      onDeleteIssue={onDeleteIssue}
                      buildMenuActions={cardMenuActions}
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
        </IssueSelectionProvider>
      </AskNumoProvider>
    </IssuePrProvider>
  );
});
