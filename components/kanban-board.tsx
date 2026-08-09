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
import { displayRank, dragBundle, planBoardMove } from "@/lib/board-drag";
import { useScrollFade } from "@/lib/use-scroll-fade";
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

const STATUS_VALUES = new Set<string>(STATUSES.map((s) => s.value));

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

  // L'ordre de lecture du board — l'ordre dans lequel un paquet glissé atterrit.
  const rank = useMemo(() => displayRank(columns), [columns]);

  const [activeId, setActiveId] = useState<string | null>(null);
  // Les tickets que le glisser en cours embarque (la carte saisie, ou toute la
  // sélection quand elle en fait partie) — ils s'estompent tous, pas juste elle.
  const [draggingIds, setDraggingIds] = useState<Set<string>>(new Set());
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
  // Lasso sur le fond du board : même sélection, un geste de moins que trente
  // ⇧-clics. Le conteneur de colonnes lui sert à la fois de surface de départ,
  // de limite et de défilement automatique.
  const {
    ref: marqueeRef,
    onPointerDown: onMarqueePointerDown,
    overlayRef: marqueeOverlayRef,
  } = useMarqueeSelection<HTMLDivElement>({
    selected: selectedIds,
    onChange: setSelectedIds,
  });
  // Déplacements de cycle sur la sélection : un ticket déjà dedans peut en
  // sortir, un ticket vivant peut y entrer — une sélection mixte offre les deux.
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
  // Une relation a exactement deux bouts : l'action n'existe qu'à deux tickets.
  const bulkLink = useMemo(() => {
    if (selectedIssues.length !== 2) return undefined;
    const [first, second] = selectedIssues;
    return () => {
      onAddRelation(first.id, "related", second.id);
      clearSelection();
    };
  }, [selectedIssues, onAddRelation, clearSelection]);
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
      marqueeRef(node);
    },
    [fadeRef, marqueeRef]
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

  const endDrag = useCallback(() => {
    setActiveId(null);
    setDraggingIds(new Set());
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    setActiveId(id);
    setDraggingIds(
      new Set(dragBundle(id, selectedIds, issueMap, rank).map((i) => i.id))
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    endDrag();
    const { active, over } = event;
    if (!over || over.id === active.id) return;

    // Toute la sélection suit dès que la carte saisie en fait partie (MIN-75).
    const bundle = dragBundle(String(active.id), selectedIds, issueMap, rank);
    if (bundle.length === 0) return;

    // Target status: dropping on a column area vs. onto a card.
    let targetStatus: IssueStatus;
    let overIssue: Issue | null = null;
    if (STATUS_VALUES.has(String(over.id))) {
      targetStatus = String(over.id) as IssueStatus;
    } else {
      overIssue = issueMap.get(String(over.id)) ?? null;
      if (!overIssue) return;
      targetStatus = overIssue.status;
    }

    const moves = planBoardMove({
      bundle,
      targetStatus,
      overIssueId: overIssue?.id ?? null,
      columnItems: issues
        .filter((i) => i.status === targetStatus)
        .sort((a, b) => a.position - b.position),
      manual: sort === "manual",
      now: Date.now(),
    });
    if (moves.length === 0) return;

    void Promise.all(moves.map((m) => onMove(m.issue.id, m.patch))).catch((err) =>
      toast.error((err as Error).message)
    );
  };

  return (
    <AgentActivityProvider projectId={projectId}>
    {/* « @ » au survol d'une carte (ou sur la sélection) ouvre Numo — même
        contexte que le bouton Numo de la pilule de sélection (MIN-105). */}
    <AskNumoProvider selectedIssues={selectedIssues} onAskNumo={onAskNumo}>
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={endDrag}
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
            // Board de projet : la sélection est mono-projet par construction,
            // donc tous ses objectifs sont proposables.
            objectives={objectives}
            onLink={bulkLink}
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
          onPointerDown={onMarqueePointerDown}
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
              onDeleteIssue={onDeleteIssue}
              buildMenuActions={buildMenuActions}
              currentCycleId={currentCycleId}
              selectedIds={selectedIds}
              draggingIds={draggingIds}
              onSelect={toggleSelection}
            />
          ))}
        </div>
      </div>

      <MarqueeOverlay overlayRef={marqueeOverlayRef} />

      {/* dropAnimation={null}: the move is optimistic (moveIssue patches the cache
          synchronously), so the real card is already at its destination on drop.
          dnd-kit's default drop animation would fly the overlay back toward the
          source card's original rect first — the confusing "return to origin then
          jump" on cross-column moves. Disabling it makes the card snap into place. */}
      <DragOverlay dropAnimation={null}>
        {activeIssue ? (
          <div className="relative w-[21rem]">
            {/* Le paquet ne se voit pas au curseur : le compte le dit. */}
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
