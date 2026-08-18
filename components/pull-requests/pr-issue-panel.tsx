"use client";

import { useCallback, useState } from "react";
import { toast } from "mangue-ui";
import { IssueSidePanel } from "@/components/issue-side-panel";
import { useProjects } from "@/lib/projects-context";
import { useIssuesQuery } from "@/lib/use-issues-query";
import { useIssueRelationsQuery } from "@/lib/use-issue-relations-query";
import { useMembersQuery } from "@/lib/use-members-query";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import type { Issue, IssueRelationType } from "@/lib/types";

/**
 * Opens the issue linked to a PR in the side panel, ABOVE the Pull
 * Requests page, without navigating to the board (MIN-66). The page being cross-project, on
 * loads the project data from the PR on the fly (members, categories,
 * objectives, issues, relationships) and we plug in the mutations like the board.
 * Mounted with `key={projectId}:{issueId}` → hooks refetched when the project changes.
 */
export function PrIssuePanel({
  projectId,
  issueId,
  onClose,
}: {
  projectId: string;
  issueId: string;
  onClose: () => void;
}) {
  const { projects } = useProjects();
  const project = projects.find((p) => p.id === projectId) ?? null;

  const { issues, createIssue, updateIssue, deleteIssue, setCategories } =
    useIssuesQuery(projectId);
  const { relations, addRelation, removeRelation } = useIssueRelationsQuery(projectId);
  const { members } = useMembersQuery(projectId, !!project);
  const { categories } = useCategoriesQuery(projectId);
  const { objectives } = useObjectivesQuery(projectId);

  // Issue displayed (can change via relationships/parent in the panel).
  const [openId, setOpenId] = useState(issueId);
  const issue: Issue | null = issues.find((i) => i.id === openId) ?? null;

  const handleAddRelation = useCallback(
    (sourceId: string, type: IssueRelationType, targetId: string) => {
      void addRelation(sourceId, type, targetId).catch((err) =>
        toast.error((err as Error).message),
      );
    },
    [addRelation],
  );
  const handleRemoveRelation = useCallback(
    (relationId: string) => {
      void removeRelation(relationId).catch((err) => toast.error((err as Error).message));
    },
    [removeRelation],
  );

  return (
    <IssueSidePanel
      issue={issue}
      open={!!issue}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      projectKey={project?.key ?? ""}
      members={members}
      categories={categories}
      objectives={objectives}
      allIssues={issues}
      relations={relations}
      onUpdate={updateIssue}
      onDelete={async (id) => {
        await deleteIssue(id);
        onClose();
      }}
      onSetCategories={setCategories}
      onCreate={createIssue}
      onOpenIssue={setOpenId}
      onAddRelation={handleAddRelation}
      onRemoveRelation={handleRemoveRelation}
    />
  );
}
