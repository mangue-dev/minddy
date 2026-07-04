"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge, cn } from "mangue-ui";
import { GitMerge } from "lucide-react";
import {
  PRIORITY_MAP,
  EFFORT_MAP,
  issueIdentifier,
} from "@/lib/issue-constants";
import { CategoryPill } from "@/components/category-pill";
import type { Category, Issue, Member } from "@/lib/types";

export type SubProgress = { done: number; total: number };

function formatDue(due: string): string {
  return new Date(due + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

/** Presentational card body — shared by the sortable card and the drag overlay. */
export function IssueCardBody({
  issue,
  projectKey,
  assignee,
  categoryMap,
  subProgress,
  dragging,
}: {
  issue: Issue;
  projectKey: string;
  assignee: Member | null;
  categoryMap: Map<string, Category>;
  subProgress?: SubProgress | null;
  dragging?: boolean;
}) {
  const priority = PRIORITY_MAP[issue.priority];
  const PriorityIcon = priority.icon;
  const cats = issue.category_ids
    .map((id) => categoryMap.get(id))
    .filter((c): c is Category => !!c);
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border bg-card p-2.5 text-left shadow-sm",
        dragging && "cursor-grabbing shadow-lg"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">
          {issueIdentifier(projectKey, issue.number)}
        </span>
        {issue.priority !== "none" && (
          <PriorityIcon className={cn("ml-auto size-3.5", priority.color)} />
        )}
      </div>
      <p className="line-clamp-3 text-sm">{issue.title}</p>
      {cats.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {cats.map((c) => (
            <CategoryPill key={c.id} category={c} />
          ))}
        </div>
      )}
      {(issue.effort || issue.due_date || assignee || (subProgress && subProgress.total > 0)) && (
        <div className="flex items-center gap-2">
          {subProgress && subProgress.total > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <GitMerge className="size-3" />
              {subProgress.done}/{subProgress.total}
            </span>
          )}
          {issue.effort && (
            <Badge variant="outline" className="font-mono text-[10px]">
              {EFFORT_MAP[issue.effort].label}
            </Badge>
          )}
          {issue.due_date && (
            <span className="text-[11px] text-muted-foreground">
              {formatDue(issue.due_date)}
            </span>
          )}
          {assignee && (
            <span
              className="ml-auto flex size-5 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground"
              title={assignee.full_name || assignee.email || undefined}
            >
              {(assignee.full_name || assignee.email || "?").slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function IssueCard({
  issue,
  projectKey,
  assignee,
  categoryMap,
  subProgress,
  onOpen,
}: {
  issue: Issue;
  projectKey: string;
  assignee: Member | null;
  categoryMap: Map<string, Category>;
  subProgress?: SubProgress | null;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: issue.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={cn("cursor-grab touch-none", isDragging && "opacity-40")}
    >
      <IssueCardBody
        issue={issue}
        projectKey={projectKey}
        assignee={assignee}
        categoryMap={categoryMap}
        subProgress={subProgress}
      />
    </div>
  );
}
