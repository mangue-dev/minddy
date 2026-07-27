"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "mangue-ui";
import { STATUSES, type StatusMeta } from "@/lib/issue-constants";
import type { IssueStatus } from "@/lib/issue-constants";
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
import { resolveRelations } from "@/lib/relation-constants";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { GlobalKanbanColumn } from "@/components/global-kanban-column";
import { AgentActivityProvider } from "@/components/agent/agent-activity-context";
import { BulkIssueActions } from "@/components/bulk-issue-actions";
import { splitCycleSelection } from "@/components/cycle/use-cycle-menu-actions";
import { IssueCardBody } from "@/components/issue-card";
import type { ChipRelation } from "@/components/relation-chips";
import type { ContextMenuAction } from "@/components/issue-context-menu";

const STATUS_VALUES = new Set<string>(STATUSES.map((s) => s.value));
const EMPTY_MEMBERS: Map<string, Member> = new Map();
const EMPTY_CATEGORIES: Map<string, Category> = new Map();
const EMPTY_OBJECTIVES: Map<string, Objective> = new Map();

/** Insert position = midpoint of the two neighbours at `index` (active excluded). */
function computePosition(items: Issue[], index: number): number {
  const before = items[index - 1];
  const after = items[index];
  if (!before && !after) return 0;
  if (!before) return after.position - 1;
  if (!after) return before.position + 1;
  return (before.position + after.position) / 2;
}

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
  const relationsByIssue = useMemo(() => {
    const map = new Map<string, ChipRelation[]>();
    if (!relations?.length) return map;
    // Blocker statuses drive relation resolution (a done blocker no longer blocks).
    const statusById = new Map(
      Array.from(allIssueMap.values(), (i) => [i.id, i.status] as const)
    );
    for (const issue of issues) {
      const resolved = resolveRelations(issue.id, relations, statusById)
        .map((r) => {
          const other = allIssueMap.get(r.otherId);
          return other ? { ...r, otherNumber: other.number } : null;
        })
        .filter((r): r is ChipRelation => r !== null);
      if (resolved.length > 0) map.set(issue.id, resolved);
    }
    return map;
  }, [issues, relations, allIssueMap]);

  const columns = useMemo(() => {
    const cmp = comparator ?? issueComparator(sort);
    return statuses.map((status) => ({
      status,
      items: issues.filter((i) => i.status === status.value).sort(cmp),
    }));
  }, [issues, statuses, sort, comparator]);

  const [activeId, setActiveId] = useState<string | null>(null);
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
  // Objectifs et relations sont propres à un projet : les actions groupées qui
  // en dépendent n'existent que si TOUTE la sélection tient dans le même.
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
  // Une relation a exactement deux bouts : l'action n'existe qu'à deux tickets.
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
      activationConstraint: { distance: readOnly ? Number.MAX_SAFE_INTEGER : 6 },
    })
  );

  // Fade the left/right edges of the board while more columns lie off-screen
  // — same affordance as the project board.
  const { ref: fadeRef, scrollProps } = useScrollFade<HTMLDivElement>("x");

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || over.id === active.id) return;

    const dragged = issueMap.get(String(active.id));
    if (!dragged) return;

    let targetStatus: IssueStatus;
    let overIssue: Issue | null = null;
    if (STATUS_VALUES.has(String(over.id))) {
      targetStatus = String(over.id) as IssueStatus;
    } else {
      overIssue = issueMap.get(String(over.id)) ?? null;
      if (!overIssue) return;
      targetStatus = overIssue.status;
    }

    const sameColumn = targetStatus === dragged.status;
    // The reco comparator is the only order in cycle mode — no manual reorder.
    if (sameColumn && (comparator || sort !== "manual")) return;

    const patch: { status?: IssueStatus; position: number } = {
      position: dragged.position,
    };
    if (!sameColumn) patch.status = targetStatus;

    if (sort === "manual") {
      const targetItems = issues
        .filter((i) => i.status === targetStatus && i.id !== dragged.id)
        .sort((a, b) => a.position - b.position);
      let index = overIssue
        ? targetItems.findIndex((i) => i.id === overIssue!.id)
        : targetItems.length;
      if (index < 0) index = targetItems.length;
      patch.position = computePosition(targetItems, index);
    } else {
      patch.position = Date.now();
    }

    void onMove(dragged.id, patch, dragged.project_id).catch((err) =>
      toast.error((err as Error).message)
    );
  };

  return (
    // Halo « agent en cours » sur les cartes cross-projet : provider en mode GLOBAL
    // (pas de projectId → endpoint /api/agent-activity, borné par la RLS).
    <AgentActivityProvider>
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
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
      <div
        ref={fadeRef}
        onScroll={scrollProps.onScroll}
        style={scrollProps.style}
        className="flex h-full min-h-0 gap-3 overflow-x-auto px-4 snap-x snap-mandatory desktop:snap-none desktop:px-6"
      >
        {columns.map(({ status, items }) => (
          <GlobalKanbanColumn
            key={status.value}
            status={status}
            issues={items}
            projectMap={projectMap}
            issueMap={issueMap}
            relationsByIssue={relationsByIssue}
            issuesByProject={issuesByProject}
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
            buildMenuActions={buildMenuActions}
            currentCycleId={currentCycleId}
            selectedIds={selectedIds}
            onSelect={toggleSelection}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeIssue ? (
          <div className="w-[21rem]">
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
    </AgentActivityProvider>
  );
}
