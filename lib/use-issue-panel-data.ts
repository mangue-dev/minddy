"use client";

import { useContext } from "react";
import { ProjectsContext } from "./projects-context-store";
import { useIssuesQuery } from "./use-issues-query";
import { useIssueRelationsQuery } from "./use-issue-relations-query";
import { useMembersQuery } from "./use-members-query";
import { useCategoriesQuery } from "./use-categories-query";
import { useObjectivesQuery } from "./use-objectives-query";
import { useIssueMutations, type IssueWriteScope } from "./use-issue-mutations";
import { useRelationMutations } from "./use-relation-mutations";
import type { Category, Issue, IssueRelation, Member, Objective } from "./types";

/** One project's collections an issue panel shows. */
export interface IssuePanelProjectData {
  members: Member[];
  categories: Category[];
  objectives: Objective[];
  issues: Issue[];
  relations: IssueRelation[];
}

/**
 * A board that already holds the panel's data under other cache keys (the
 * cross-project board reads one aggregate) hands it over, so opening a ticket
 * there does not read the project again.
 */
export interface IssuePanelBoardData {
  /** The analytics surface of the panel's writes. */
  scope: IssueWriteScope;
  forProject: (projectId: string) => IssuePanelProjectData | undefined;
}

/**
 * What the issue side panel needs for the issue's project: its collections,
 * read through the same queries as the project board (shared caches, so a
 * board that loaded them costs no request), and the shared writers.
 */
export function useIssuePanelData(projectId: string | null, board?: IssuePanelBoardData) {
  const fromBoard = projectId ? board?.forProject(projectId) : undefined;
  const ownProject = fromBoard ? null : projectId;
  const { issues } = useIssuesQuery(ownProject);
  const { relations } = useIssueRelationsQuery(ownProject);
  const { members } = useMembersQuery(ownProject, true);
  const { categories } = useCategoriesQuery(ownProject);
  const { objectives } = useObjectivesQuery(ownProject);
  const { updateIssue, deleteIssue, setCategories } = useIssueMutations(board?.scope ?? "project");
  const { addRelation, removeRelation } = useRelationMutations(projectId);
  // Read without requiring the provider: some hosts render the panel outside it.
  const project = useContext(ProjectsContext)?.projects.find((p) => p.id === projectId);

  return {
    project,
    projectKey: project?.key ?? "",
    members: fromBoard?.members ?? members,
    categories: fromBoard?.categories ?? categories,
    objectives: fromBoard?.objectives ?? objectives,
    allIssues: fromBoard?.issues ?? issues,
    relations: fromBoard?.relations ?? relations,
    updateIssue,
    deleteIssue,
    setCategories,
    addRelation,
    removeRelation,
  };
}
