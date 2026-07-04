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
import { STATUSES } from "@/lib/issue-constants";
import type { IssueStatus } from "@/lib/issue-constants";
import type { Issue, Member } from "@/lib/types";
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
  projectKey,
  members,
  onOpenIssue,
  onMove,
}: {
  issues: Issue[];
  projectKey: string;
  members: Member[];
  onOpenIssue: (issue: Issue) => void;
  onMove: (
    issueId: string,
    patch: { status?: IssueStatus; position: number }
  ) => Promise<void>;
}) {
  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.user_id, m])),
    [members]
  );

  const columns = useMemo(
    () =>
      STATUSES.map((status) => ({
        status,
        items: issues
          .filter((i) => i.status === status.value)
          .sort((a, b) => a.position - b.position),
      })),
    [issues]
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIssue = activeId ? issues.find((i) => i.id === activeId) ?? null : null;

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

    const targetItems = issues
      .filter((i) => i.status === targetStatus && i.id !== dragged.id)
      .sort((a, b) => a.position - b.position);

    let index = overIssue
      ? targetItems.findIndex((i) => i.id === overIssue!.id)
      : targetItems.length;
    if (index < 0) index = targetItems.length;

    const position = computePosition(targetItems, index);
    const patch: { status?: IssueStatus; position: number } = { position };
    if (targetStatus !== dragged.status) patch.status = targetStatus;

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
            projectKey={projectKey}
            memberMap={memberMap}
            onOpenIssue={onOpenIssue}
          />
        ))}
      </div>

      <DragOverlay>
        {activeIssue ? (
          <div className="w-64">
            <IssueCardBody
              issue={activeIssue}
              projectKey={projectKey}
              assignee={
                activeIssue.assignee_id
                  ? memberMap.get(activeIssue.assignee_id) ?? null
                  : null
              }
              dragging
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
