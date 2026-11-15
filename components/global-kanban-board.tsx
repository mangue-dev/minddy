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
  Category,
  Issue,
  IssueRelation,
  IssueRelationType,
  IssueUpdateInput,
  Member,
  Objective,
  Project,
  SortDirection,
  ViewSort,
} from "@/lib/types";
import { boardComparatorFactory } from "@/lib/smart-triage";
import { boardBlockingContext } from "@/lib/cycle";
import type { ObjectiveStatus } from "@/lib/objective-constants";
import { resolveDisplayRelationsByIssue } from "@/lib/relation-constants";
import { isIssueStatus, issueIdentifier } from "@/lib/issue-constants";
import { ProjectRolesContext } from "@/lib/projects-context-store";
import { projectCapabilities } from "@/lib/project-roles";
import { sharedMembers, writableSelection } from "@/lib/global-board-selection";
import { useTranslations } from "next-intl";
import { useBoardCardInstructions, useDragAnnouncements } from "@/lib/use-drag-announcements";
import { promptRelations } from "@/lib/issue-prompt";
import { useBulkSelectionActions } from "@/lib/use-bulk-selection-actions";
import type { RelationKinds } from "@/lib/use-issue-relations-query";
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
import { GlobalKanbanColumn } from "@/components/global-kanban-column";
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

/** Read-only boards (past and future cycles) register no sensor, so no drag can start. */
const NO_SENSORS: SensorDescriptor<SensorOptions>[] = [];

/**
 * The cross-project kanban's drag-and-drop surface (MIN-29) — the same DnD model
 * as <KanbanBoard>: drag a card between columns to change its status, or reorder
 * within a column under manual sort. Positions are computed among the board's
 * (cross-project) column items; the writers resolve each issue's project from
 * its row. Cards of projects the viewer only reads cannot be selected.
 */
export const GlobalKanbanBoard = memo(function GlobalKanbanBoard({
  issues,
  allIssues,
  relations,
  statuses,
  sort,
  sortDirection,
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
  onRemoveRelation,
  comparator,
  buildMenuActions,
  currentCycleId,
  bulkCycleId,
  onSetCycle,
  readOnly = false,
  horizontalScroll,
}: {
  issues: Issue[];
  /** Every board issue (unfiltered, all projects) — resolves relation targets
      hidden by the view/cycle scope, and feeds the "add relation" picker. */
  allIssues: Issue[];
  /** Stored relation rows across my projects — the cards' chips (MIN-25). */
  relations: IssueRelation[];
  statuses: StatusMeta[];
  sort: ViewSort;
  /** Direction of the sort (MIN-592) — reversed by the invert button for the
      directional sorts; ignored by "smart" and "manual". */
  sortDirection?: SortDirection;
  projectMap: Map<string, Project>;
  memberMapByProject: Map<string, Map<string, Member>>;
  categoryMapByProject: Map<string, Map<string, Category>>;
  objectiveMapByProject: Map<string, Map<string, Objective>>;
  onOpenIssue: (issue: Issue) => void;
  /** Opens a related issue's side panel (clicking a relation chip). */
  onOpenIssueById?: (issueId: string) => void;
  onOpenPlan: (issue: Issue) => void;
  onUpdateIssue: (issueId: string, patch: IssueUpdateInput) => void;
  onDeleteIssue: (issueId: string) => Promise<boolean>;
  onAskNumo: (issues: Issue[]) => void;
  onSetCategories: (issueId: string, ids: string[]) => void;
  onMove: (issueId: string, patch: { status?: IssueStatus; position: number }) => void;
  /** Open the app-wide create dialog preset to a column's status (MIN-33).
      Absent → the columns render no "new issue" footer (cycle mode). */
  onCreateIssue?: (status: IssueStatus) => void;
  /** Adds a relation from a card (right-click). */
  onAddRelation?: (
    sourceId: string,
    type: IssueRelationType,
    targetId: string,
    kinds?: RelationKinds,
  ) => void;
  /** Removes a relation from a card's relation popover. */
  onRemoveRelation?: (relationId: string) => void;
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
  /** Shared with the loading shell so replacing it does not reset the board. */
  horizontalScroll?: BoardScrollPosition;
}) {
  const issueMap = useMemo(
    () => new Map(issues.map((i) => [i.id, i])),
    [issues],
  );

  // Relation resolution + picker candidates work on the FULL board (the other
  // end of a relation may be outside the current view/cycle scope).
  const allIssueMap = useMemo(
    () => new Map(allIssues.map((i) => [i.id, i])),
    [allIssues],
  );
  const issuesByProject = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const i of allIssues) {
      const list = map.get(i.project_id);
      if (list) list.push(i);
      else map.set(i.project_id, [i]);
    }
    return map;
  }, [allIssues]);
  const issuesByProjectRef = useRef(issuesByProject);
  issuesByProjectRef.current = issuesByProject;
  const getCandidateIssues = useCallback(
    (projectId: string) => issuesByProjectRef.current.get(projectId),
    [],
  );
  const relationsByIssue = useMemo(() => resolveDisplayRelationsByIssue(
    relations, allIssueMap, new Map(Array.from(objectiveMapByProject.values()).flatMap((map) => Array.from(map))),
  ), [relations, allIssueMap, objectiveMapByProject]);

  // Cycle mode pins ONE comparator for every column (the reco order);
  // otherwise the view sort builds its comparator per column (MIN-576), with
  // the same blocking context as the project board.
  const makeComparator = useMemo(() => {
    if (comparator) return () => comparator;
    const objectiveStatusById = new Map<string, ObjectiveStatus>();
    for (const byProject of objectiveMapByProject.values()) {
      for (const objective of byProject.values()) {
        objectiveStatusById.set(objective.id, objective.status);
      }
    }
    const context = boardBlockingContext(allIssues, relations, objectiveStatusById);
    return boardComparatorFactory(
      sort,
      {
        relations: context.knownRelations,
        statusById: context.statusById,
        objectiveByIssue: context.objectiveByIssue,
      },
      sortDirection ?? "asc"
    );
  }, [comparator, sort, sortDirection, relations, allIssues, objectiveMapByProject]);
  const buildColumns = useMemo(() => createBoardColumnsBuilder(), []);
  const columns = useMemo(
    () => buildColumns(statuses, issues, makeComparator),
    [buildColumns, issues, statuses, makeComparator],
  );

  // Project readers (MIN-693) browse their cards but never select them, so
  // the selection's bulk actions only ever edit writable issues.
  const roles = useContext(ProjectRolesContext);
  const canWriteIn = useCallback(
    (projectId: string) =>
      projectCapabilities(roles?.get(projectId)?.role ?? "member").canWrite,
    [roles],
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
  // Lasso on the bottom of the board — same hook, same selection as the project board.
  const {
    ref: marqueeRef,
    onPointerDown: onMarqueePointerDown,
    overlayRef: marqueeOverlayRef,
  } = useMarqueeSelection<HTMLDivElement>({
    selected: selectedIds,
    onChange: selectWritable,
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
  const bulkMembers = useMemo(
    () => sharedMembers(selectedIssues, memberMapByProject),
    [selectedIssues, memberMapByProject],
  );
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
    if (selectedIssues.length !== 2 || !selectionProjectId || !onAddRelation) {
      return undefined;
    }
    const [first, second] = selectedIssues;
    return () => {
      onAddRelation(first.id, "related", second.id);
      clearSelection();
    };
  }, [selectedIssues, selectionProjectId, onAddRelation, clearSelection]);
  // ⇧P on the selection (MIN-539): ONE combined prompt for all the checked
  // tickets. A mixed selection spans projects: the prompt resolves each
  // issue's key in its own project, and the Numo intent stays projectless
  // (the composer asks, like the existing bulk “Ask Numo”).
  const bulkPromptActions = useBulkSelectionActions({
    selectedIssues,
    buildInput: (issue) => {
      const objectives = objectiveMapByProject.get(issue.project_id);
      return {
        issue,
        projectId: issue.project_id,
        projectKey: projectMap.get(issue.project_id)?.key ?? "",
        resourceCount: issue.resource_count,
        categories: issue.category_ids
          .map((cid) => categoryMapByProject.get(issue.project_id)?.get(cid)?.name)
          .filter((name): name is string => !!name),
        relations: promptRelations(relationsByIssue.get(issue.id), {
          identifierOf: (otherId) => {
            const other = allIssueMap.get(otherId);
            const key = other ? projectMap.get(other.project_id)?.key : undefined;
            return other && key ? issueIdentifier(key, other.number) : "";
          },
          titleOf: (otherId) =>
            objectives?.get(otherId)?.name ?? allIssueMap.get(otherId)?.title ?? "",
        }),
      };
    },
    onUpdateIssue: (issue, patch) => onUpdateIssue(issue.id, patch),
  });
  // The dragged bundle, drop marker, and persisted move share the same
  // calculation as the project board (see lib/use-board-drop.ts).
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const drop = useBoardDrop({
    root: scrollerRef,
    columns,
    makeComparator,
    manual: sort === "manual",
    issueMap,
    selectedIds,
    // Cycle views preserve their display order, so only cross-column status
    // changes are persisted.
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
  // Mouse-only drag (touch scrolls the swipeable columns) — mirrors KanbanBoard.
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: BOARD_MOUSE_ACTIVATION_DISTANCE },
    }),
  );

  // Fade the left/right edges of the board while more columns lie off-screen
  // — same affordance as the project board.
  const {
    ref: fadeRef,
    scrollProps,
    edges,
  } = useScrollFade<HTMLDivElement>("x");

  // The edge fade and marquee selection share one stable callback ref.
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
    // The "agent at work" halo on cross-project cards: the provider receives
    // every project this board shows.
    <IssuePrProvider projectIds={[...projectMap.keys()]}>
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
            <BulkIssueActionsPresence>
              {selectedIssues.length > 0 && (
                <BulkIssueActions
                  key="bulk-actions"
                  count={selectedIssues.length}
                  issues={selectedIssues}
                  members={bulkMembers}
                  onUpdate={updateSelected}
                  onDelete={async () => {
                    await Promise.all(
                      selectedIssues.map((issue) => onDeleteIssue(issue.id)),
                    );
                    clearSelection();
                  }}
                  onClear={clearSelection}
                  onAskNumo={() => onAskNumo(selectedIssues)}
                  onCopyPrompt={() => void bulkPromptActions.copyPrompt()}
                  cycle={bulkCycle}
                  objectives={bulkObjectives}
                  onLink={bulkLink}
                />
              )}
            </BulkIssueActionsPresence>
            {/* Edge fade NEXT to the scroller, not on it (MIN-319). */}
            <div className="relative flex h-full min-h-0 flex-col">
              <div
                ref={setScrollerRef}
                onScroll={(event) => {
                  preservedHorizontalScroll.current =
                    event.currentTarget.scrollLeft;
                  scrollProps.onScroll();
                }}
                onPointerDown={onMarqueePointerDown}
                style={isLanding ? { scrollSnapType: "none" } : undefined}
                className={cn("mobile-kanban-scroller min-h-0 flex-1", BOARD_SCROLLER_CLASS)}
              >
                {columns.map(({ status, items }) => (
                  <GlobalKanbanColumn
                    key={status.value}
                    status={status}
                    issues={items}
                    projectMap={projectMap}
                    issueMap={allIssueMap}
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
                    canWriteIn={canWriteIn}
                  />
                ))}
              </div>
              <ScrollFadeEdges edges={edges} axis="x" className="z-30" />
            </div>

            <MarqueeOverlay overlayRef={marqueeOverlayRef} />

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
