"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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
import { cn, toast } from "mangue-ui";
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
  ViewSort,
} from "@/lib/types";
import { resolveRelations } from "@/lib/relation-constants";
import { issueComparator } from "@/lib/view-filter";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { KanbanColumn } from "@/components/kanban-column";
import { IssueCardBody } from "@/components/issue-card";
import { AgentActivityProvider } from "@/components/agent/agent-activity-context";
import { BulkIssueActions } from "@/components/bulk-issue-actions";
import type { ChipRelation } from "@/components/relation-chips";
import type { ContextMenuAction } from "@/components/issue-context-menu";

const STATUS_VALUES = new Set<string>(STATUSES.map((s) => s.value));

/** Insert position = midpoint of the two neighbours at `index` (active excluded). */
function computePosition(items: Issue[], index: number): number {
  const before = items[index - 1];
  const after = items[index];
  if (!before && !after) return 0;
  if (!before) return after.position - 1;
  if (!after) return before.position + 1;
  return (before.position + after.position) / 2;
}

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
  const relationsByIssue = useMemo(() => {
    const map = new Map<string, ChipRelation[]>();
    if (relations.length === 0) return map;
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
    const cmp = issueComparator(sort);
    return statuses.map((status) => ({
      status,
      items: issues.filter((i) => i.status === status.value).sort(cmp),
    }));
  }, [issues, statuses, sort]);

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
  const activeIssue = activeId ? issues.find((i) => i.id === activeId) ?? null : null;
  const activeParent =
    activeIssue?.parent_id ? issueMap.get(activeIssue.parent_id) ?? null : null;

  // MouseSensor (not PointerSensor) so drag-and-drop is mouse-only: on touch the
  // board is a swipeable stack of full-width columns and DnD would fight the
  // scroll, so touch never starts a drag (status changes go through the card →
  // side panel instead). Desktop mouse drag is unchanged.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } })
  );

  // Fade the left/right edges of the board while more columns lie off-screen.
  const { ref: fadeRef, scrollProps } = useScrollFade<HTMLDivElement>("x");

  // Mobile: track which column is snapped into view to drive the dot indicator.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const setScrollerRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollerRef.current = node;
      fadeRef(node);
    },
    [fadeRef]
  );
  const [activeColumn, setActiveColumn] = useState(0);
  const columnCount = columns.length;

  const updateActiveColumn = useCallback(
    (el: HTMLDivElement) => {
      if (el.scrollWidth <= el.clientWidth + 1) {
        setActiveColumn(0);
        return;
      }
      const stride = el.scrollWidth / columnCount;
      const idx = Math.min(
        columnCount - 1,
        Math.max(0, Math.round(el.scrollLeft / stride))
      );
      setActiveColumn(idx);
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
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || over.id === active.id) return;

    const dragged = issues.find((i) => i.id === active.id);
    if (!dragged) return;

    // Target status: dropping on a column area vs. onto a card.
    let targetStatus: IssueStatus;
    let overIssue: Issue | null = null;
    if (STATUS_VALUES.has(String(over.id))) {
      targetStatus = String(over.id) as IssueStatus;
    } else {
      overIssue = issues.find((i) => i.id === over.id) ?? null;
      if (!overIssue) return;
      targetStatus = overIssue.status;
    }

    const sameColumn = targetStatus === dragged.status;
    // With a non-manual sort the column order is field-derived — no reordering.
    if (sameColumn && sort !== "manual") return;

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
      // Field-sorted cross-column move: position is cosmetic — land at the end.
      patch.position = Date.now();
    }

    void onMove(dragged.id, patch).catch((err) =>
      toast.error((err as Error).message)
    );
  };

  return (
    <AgentActivityProvider projectId={projectId}>
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
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
          />
        )}
        <ColumnDots
          statuses={columns.map((c) => c.status)}
          active={activeColumn}
          onSelect={scrollToColumn}
        />
        <div
          ref={setScrollerRef}
          onScroll={(e) => {
            scrollProps.onScroll();
            updateActiveColumn(e.currentTarget);
          }}
          style={scrollProps.style}
          className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 snap-x snap-mandatory desktop:snap-none desktop:px-6"
        >
          {columns.map(({ status, items }) => (
            <KanbanColumn
              key={status.value}
              status={status}
              issues={items}
              issueMap={issueMap}
              relationsByIssue={relationsByIssue}
              candidateIssues={allIssues}
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
              buildMenuActions={buildMenuActions}
              currentCycleId={currentCycleId}
              selectedIds={selectedIds}
              onSelect={toggleSelection}
            />
          ))}
        </div>
      </div>

      {/* dropAnimation={null}: the move is optimistic (moveIssue patches the cache
          synchronously), so the real card is already at its destination on drop.
          dnd-kit's default drop animation would fly the overlay back toward the
          source card's original rect first — the confusing "return to origin then
          jump" on cross-column moves. Disabling it makes the card snap into place. */}
      <DragOverlay dropAnimation={null}>
        {activeIssue ? (
          <div className="w-[21rem]">
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
    </AgentActivityProvider>
  );
}

/**
 * Mobile-only pagination dots for the swipeable board: one dot per status column,
 * the active one widened. Tapping a dot scrolls that column into view. Hidden on
 * desktop (the full board is visible) and when there's only one column.
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
    <div className="flex shrink-0 items-center justify-center gap-1.5 pb-2 desktop:hidden">
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
