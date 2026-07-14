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
 * Ouvre l'issue liée à une PR dans le panneau latéral, PAR-DESSUS la page Pull
 * Requests, sans naviguer vers le board (MIN-66). La page étant cross-projet, on
 * charge à la volée les données du projet de la PR (membres, catégories,
 * objectifs, issues, relations) et on branche les mutations comme le board.
 * Monté avec `key={projectId}:{issueId}` → hooks refetchés au changement de projet.
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

  // Issue affichée (peut changer via les relations/parent dans le panneau).
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
