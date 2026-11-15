"use client";
import { useAppTabChange } from "@/lib/use-app-tab-change";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { IssueSidePanel } from "@/components/issue-side-panel";
import { useProjects } from "@/lib/projects-context";
import { useIssuesQuery } from "@/lib/use-issues-query";
import { useIssueRelationsQuery, type RelationKinds } from "@/lib/use-issue-relations-query";
import { useMembersQuery } from "@/lib/use-members-query";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import type { Issue, IssueRelationType } from "@/lib/types";

/**
 * Opens the issue linked to a PR in the side panel, ABOVE the Pull Requests
 * page, without navigating to the board (MIN-66). The page is cross-project, so
 * the PR's project data (members, categories, objectives, issues, relations) is
 * loaded on the fly and the board's writers are plugged in.
 * Mounted with `key={projectId}:{issueId}`, so the hooks refetch when the
 * project changes.
 */
export function PrIssuePanel({
  projectId,
  issueId,
  open = true,
  onClose,
}: {
  projectId: string;
  issueId: string;
  /** False while the host keeps the panel mounted for its exit animation. */
  open?: boolean;
  onClose: () => void;
}) {
  useAppTabChange(onClose);
  const { projects } = useProjects();
  const project = projects.find((p) => p.id === projectId) ?? null;

  const { issues, updateIssue, deleteIssue, setCategories } =
    useIssuesQuery(projectId);
  const { relations, addRelation, removeRelation } = useIssueRelationsQuery(projectId);
  const { members } = useMembersQuery(projectId, !!project);
  const { categories } = useCategoriesQuery(projectId);
  const { objectives } = useObjectivesQuery(projectId);

  // The issue shown (relations and the parent link can change it).
  const [openId, setOpenId] = useState(issueId);
  const issue: Issue | null = issues.find((i) => i.id === openId) ?? null;

  const handleAddRelation = useCallback(
    (
      sourceId: string,
      type: IssueRelationType,
      targetId: string,
      kinds?: RelationKinds
    ) => {
      void addRelation(sourceId, type, targetId, kinds).catch((err) =>
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
      open={open && !!issue}
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
      // The panel closes itself after a successful delete, which calls onClose.
      onDelete={deleteIssue}
      onSetCategories={setCategories}
      onOpenIssue={setOpenId}
      onAddRelation={handleAddRelation}
      onRemoveRelation={handleRemoveRelation}
    />
  );
}
