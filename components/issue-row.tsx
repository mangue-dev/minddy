"use client";

import { Badge, cn } from "mangue-ui";
import {
  STATUS_MAP,
  PRIORITY_MAP,
  EFFORT_MAP,
  issueIdentifier,
} from "@/lib/issue-constants";
import type { Issue, Member } from "@/lib/types";

function formatDue(due: string): string {
  const d = new Date(due + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function IssueRow({
  issue,
  projectKey,
  assignee,
  onClick,
}: {
  issue: Issue;
  projectKey: string;
  assignee: Member | null;
  onClick: () => void;
}) {
  const status = STATUS_MAP[issue.status];
  const priority = PRIORITY_MAP[issue.priority];
  const StatusIcon = status.icon;
  const PriorityIcon = priority.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/60"
    >
      <StatusIcon className={cn("size-4 shrink-0", status.color)} />
      <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
        {issueIdentifier(projectKey, issue.number)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{issue.title}</span>

      {issue.priority !== "none" && (
        <PriorityIcon className={cn("size-4 shrink-0", priority.color)} />
      )}
      {issue.effort && (
        <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
          {EFFORT_MAP[issue.effort].label}
        </Badge>
      )}
      {issue.due_date && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatDue(issue.due_date)}
        </span>
      )}
      {assignee && (
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground"
          title={assignee.full_name || assignee.email || undefined}
        >
          {(assignee.full_name || assignee.email || "?").slice(0, 2).toUpperCase()}
        </span>
      )}
    </button>
  );
}
