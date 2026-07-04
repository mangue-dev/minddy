"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "mangue-ui";
import type { StatusMeta } from "@/lib/issue-constants";
import type { Issue, Member } from "@/lib/types";
import { IssueCard } from "@/components/issue-card";

export function KanbanColumn({
  status,
  issues,
  projectKey,
  memberMap,
  onOpenIssue,
}: {
  status: StatusMeta;
  issues: Issue[];
  projectKey: string;
  memberMap: Map<string, Member>;
  onOpenIssue: (issue: Issue) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.value });
  const Icon = status.icon;

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <Icon className={cn("size-4", status.color)} />
        <h2 className="text-sm font-semibold">{status.label}</h2>
        <span className="text-xs text-muted-foreground">{issues.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-xl bg-muted/40 p-2 transition-colors",
          isOver && "bg-muted"
        )}
      >
        <SortableContext
          items={issues.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {issues.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              projectKey={projectKey}
              assignee={
                issue.assignee_id ? memberMap.get(issue.assignee_id) ?? null : null
              }
              onOpen={() => onOpenIssue(issue)}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
