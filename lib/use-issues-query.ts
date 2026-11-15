"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { issuesQueryFn } from "./issues-api";
import { useIssueMutations } from "./use-issue-mutations";
import type { CreateIssueInput, Issue } from "./types";

/** Stable while loading: memoized board columns and cards keep their render. */
const NO_ISSUES: Issue[] = [];

/**
 * One project's issues and the shared issue writers (lib/use-issue-mutations.ts).
 *
 * Freshness across clients (Numo, MCP, other members) comes from the central
 * realtime bridge (lib/realtime-provider.tsx) invalidating ["issues", projectId].
 */
export function useIssuesQuery(projectId: string | null) {
  const mutations = useIssueMutations("project");
  const enabled = !!projectId;
  const { data, isPending, error } = useQuery({
    queryKey: ["issues", projectId ?? ""],
    queryFn: issuesQueryFn(projectId ?? ""),
    enabled,
  });

  const { createIssue: createIssueInProject } = mutations;
  const createIssue = useCallback(
    (input: CreateIssueInput) => createIssueInProject(projectId as string, input),
    [createIssueInProject, projectId]
  );

  return {
    issues: (data ?? NO_ISSUES) as Issue[],
    loading: enabled && isPending,
    error: error as Error | null,
    createIssue,
    /** The create dialog's "create in another project" target. */
    createIssueInProject,
    updateIssue: mutations.updateIssue,
    moveIssue: mutations.moveIssue,
    setIssueCycle: mutations.setIssueCycle,
    setCategories: mutations.setCategories,
    deleteIssue: mutations.deleteIssue,
  };
}
