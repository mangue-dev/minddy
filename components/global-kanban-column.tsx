"use client";

import { useCallback } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "mangue-ui";
import { useTranslations } from "next-intl";
import type { StatusMeta } from "@/lib/issue-constants";
import type {
  Category,
  Issue,
  IssueUpdateInput,
  Member,
  Objective,
  Project,
} from "@/lib/types";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { IssueCard } from "@/components/issue-card";
import { StatusIndicator } from "@/components/issue-indicators";

const EMPTY_MEMBERS: Map<string, Member> = new Map();
const EMPTY_CATEGORIES: Map<string, Category> = new Map();
const EMPTY_OBJECTIVES: Map<string, Objective> = new Map();

/**
 * One status column of the cross-project kanban (MIN-29). Same droppable +
 * sortable machinery as <KanbanColumn>, but every card is fed its OWN project's
 * key/members/categories/objectives (looked up by `issue.project_id`) so it's a
 * fully interactive project card. No "new issue" footer (which project would it
 * target?) and no relation affordances (relations are per-project).
 */
export function GlobalKanbanColumn({
  status,
  issues,
  projectMap,
  issueMap,
  memberMapByProject,
  categoryMapByProject,
  objectiveMapByProject,
  onOpenIssue,
  onOpenPlan,
  onUpdateIssue,
  onSetCategories,
}: {
  status: StatusMeta;
  issues: Issue[];
  projectMap: Map<string, Project>;
  /** Every board issue by id — resolves a sub-issue's parent (same project). */
  issueMap: Map<string, Issue>;
  memberMapByProject: Map<string, Map<string, Member>>;
  categoryMapByProject: Map<string, Map<string, Category>>;
  objectiveMapByProject: Map<string, Map<string, Objective>>;
  onOpenIssue: (issue: Issue) => void;
  onOpenPlan: (issue: Issue) => void;
  onUpdateIssue: (issueId: string, patch: IssueUpdateInput, projectId: string) => void;
  onSetCategories: (issueId: string, ids: string[], projectId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.value });
  const { ref: fadeRef, scrollProps } = useScrollFade<HTMLDivElement>();
  const ts = useTranslations("Status");

  const setScrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      fadeRef(node);
    },
    [setNodeRef, fadeRef]
  );

  return (
    <div className="flex w-full shrink-0 snap-center flex-col desktop:w-[22rem]">
      <div className="mb-2 flex items-center gap-2 px-1">
        <StatusIndicator status={status.value} className="size-4" />
        <h2 className="text-sm font-semibold">{ts(status.value)}</h2>
        <span className="text-xs text-muted-foreground">{issues.length}</span>
      </div>

      <div
        ref={setScrollRef}
        onScroll={scrollProps.onScroll}
        style={scrollProps.style}
        className={cn(
          "no-scrollbar flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-xl p-2 transition-colors",
          isOver && "bg-muted/50"
        )}
      >
        <SortableContext
          items={issues.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {issues.map((issue) => {
            const project = projectMap.get(issue.project_id);
            const pid = issue.project_id;
            const parent = issue.parent_id
              ? issueMap.get(issue.parent_id) ?? null
              : null;
            return (
              <IssueCard
                key={issue.id}
                issue={issue}
                projectId={pid}
                projectKey={project?.key ?? ""}
                project={project}
                memberMap={memberMapByProject.get(pid) ?? EMPTY_MEMBERS}
                categoryMap={categoryMapByProject.get(pid) ?? EMPTY_CATEGORIES}
                objectiveMap={objectiveMapByProject.get(pid) ?? EMPTY_OBJECTIVES}
                parentNumber={parent?.number}
                onOpenParent={parent ? () => onOpenIssue(parent) : undefined}
                onOpenPlan={() => onOpenPlan(issue)}
                onOpen={() => onOpenIssue(issue)}
                onUpdateIssue={(id, patch) => onUpdateIssue(id, patch, pid)}
                onSetCategories={(id, ids) => onSetCategories(id, ids, pid)}
              />
            );
          })}
        </SortableContext>
      </div>
    </div>
  );
}
