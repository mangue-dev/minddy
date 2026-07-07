"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "mangue-ui";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { StatusMeta, IssueStatus } from "@/lib/issue-constants";
import type { Category, Issue, IssueUpdateInput, Member, Objective } from "@/lib/types";
import { IssueCard } from "@/components/issue-card";
import { StatusIndicator } from "@/components/issue-indicators";

export function KanbanColumn({
  status,
  issues,
  issueMap,
  projectKey,
  memberMap,
  categoryMap,
  objectiveMap,
  onOpenIssue,
  onCreateIssue,
  onUpdateIssue,
  onSetCategories,
}: {
  status: StatusMeta;
  issues: Issue[];
  /** All project issues by id — used to resolve a sub-issue's parent. */
  issueMap: Map<string, Issue>;
  projectKey: string;
  memberMap: Map<string, Member>;
  categoryMap: Map<string, Category>;
  objectiveMap?: Map<string, Objective>;
  onOpenIssue: (issue: Issue) => void;
  onCreateIssue: (status: IssueStatus) => void;
  onUpdateIssue: (issueId: string, patch: IssueUpdateInput) => void;
  onSetCategories: (issueId: string, ids: string[]) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.value });
  const t = useTranslations("Board");
  const ts = useTranslations("Status");

  return (
    <div className="flex w-[22rem] shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <StatusIndicator status={status.value} className="size-4" />
        <h2 className="text-sm font-semibold">{ts(status.value)}</h2>
        <span className="text-xs text-muted-foreground">{issues.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-xl p-2 transition-colors",
          isOver && "bg-muted/50"
        )}
      >
        <SortableContext
          items={issues.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {issues.map((issue) => {
            const parent = issue.parent_id
              ? issueMap.get(issue.parent_id) ?? null
              : null;
            return (
              <IssueCard
                key={issue.id}
                issue={issue}
                projectKey={projectKey}
                memberMap={memberMap}
                categoryMap={categoryMap}
                objectiveMap={objectiveMap}
                parentNumber={parent?.number}
                onOpenParent={parent ? () => onOpenIssue(parent) : undefined}
                onOpen={() => onOpenIssue(issue)}
                onUpdateIssue={onUpdateIssue}
                onSetCategories={onSetCategories}
              />
            );
          })}
        </SortableContext>

        <button
          type="button"
          onClick={() => onCreateIssue(status.value)}
          className="flex w-full shrink-0 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-6 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/40 hover:text-foreground"
        >
          <Plus className="size-4" />
          {t("newIssue")}
        </button>
      </div>
    </div>
  );
}
