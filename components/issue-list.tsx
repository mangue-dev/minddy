"use client";

import { useMemo } from "react";
import { STATUSES } from "@/lib/issue-constants";
import type { Issue, Member } from "@/lib/types";
import { IssueRow } from "@/components/issue-row";

/** Issues grouped by status (fixed order). The DnD kanban board is chantier 4. */
export function IssueList({
  issues,
  projectKey,
  members,
  onOpenIssue,
}: {
  issues: Issue[];
  projectKey: string;
  members: Member[];
  onOpenIssue: (issue: Issue) => void;
}) {
  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.user_id, m])),
    [members]
  );

  const groups = useMemo(
    () =>
      STATUSES.map((status) => ({
        status,
        items: issues.filter((i) => i.status === status.value),
      })).filter((g) => g.items.length > 0),
    [issues]
  );

  return (
    <div className="flex flex-col gap-6">
      {groups.map(({ status, items }) => {
        const Icon = status.icon;
        return (
          <section key={status.value}>
            <div className="mb-1 flex items-center gap-2 px-2">
              <Icon className={`size-4 ${status.color}`} />
              <h2 className="text-sm font-semibold">{status.label}</h2>
              <span className="text-xs text-muted-foreground">{items.length}</span>
            </div>
            <div className="flex flex-col">
              {items.map((issue) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  projectKey={projectKey}
                  assignee={
                    issue.assignee_id ? memberMap.get(issue.assignee_id) ?? null : null
                  }
                  onClick={() => onOpenIssue(issue)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
