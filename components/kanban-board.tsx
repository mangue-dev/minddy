"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "mangue-ui";
import { STATUSES, type StatusMeta } from "@/lib/issue-constants";
import type { IssueStatus } from "@/lib/issue-constants";
import type { Category, Issue, IssueUpdateInput, Member, Objective, ViewSort } from "@/lib/types";
import { issueComparator } from "@/lib/view-filter";
import { KanbanColumn } from "@/components/kanban-column";
import { IssueCardBody } from "@/components/issue-card";

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
  statuses,
  sort,
  projectId,
  projectKey,
  members,
  categories,
  objectives,
  onOpenIssue,
  onOpenPlan,
  onCreateIssue,
  onUpdateIssue,
  onSetCategories,
  onMove,
}: {
  issues: Issue[];
  statuses: StatusMeta[];
  sort: ViewSort;
  projectId: string;
  projectKey: string;
  members: Member[];
  categories: Category[];
  objectives: Objective[];
  onOpenIssue: (issue: Issue) => void;
  onOpenPlan: (issue: Issue) => void;
  onCreateIssue: (status: IssueStatus) => void;
  onUpdateIssue: (issueId: string, patch: IssueUpdateInput) => void;
  onSetCategories: (issueId: string, ids: string[]) => void;
  onMove: (
    issueId: string,
    patch: { status?: IssueStatus; position: number }
  ) => Promise<void>;
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

  const columns = useMemo(() => {
    const cmp = issueComparator(sort);
    return statuses.map((status) => ({
      status,
      items: issues.filter((i) => i.status === status.value).sort(cmp),
    }));
  }, [issues, statuses, sort]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIssue = activeId ? issues.find((i) => i.id === activeId) ?? null : null;
  const activeParent =
    activeIssue?.parent_id ? issueMap.get(activeIssue.parent_id) ?? null : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex h-full gap-3 overflow-x-auto pb-2">
        {columns.map(({ status, items }) => (
          <KanbanColumn
            key={status.value}
            status={status}
            issues={items}
            issueMap={issueMap}
            projectId={projectId}
            projectKey={projectKey}
            memberMap={memberMap}
            categoryMap={categoryMap}
            objectiveMap={objectiveMap}
            onOpenIssue={onOpenIssue}
            onOpenPlan={onOpenPlan}
            onCreateIssue={onCreateIssue}
            onUpdateIssue={onUpdateIssue}
            onSetCategories={onSetCategories}
          />
        ))}
      </div>

      <DragOverlay>
        {activeIssue ? (
          <div className="w-[21rem]">
            <IssueCardBody
              issue={activeIssue}
              projectKey={projectKey}
              memberMap={memberMap}
              categoryMap={categoryMap}
              objectiveMap={objectiveMap}
              parentNumber={activeParent?.number}
              dragging
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
