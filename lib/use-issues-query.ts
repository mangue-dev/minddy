"use client";

import { useQuery } from "@tanstack/react-query";
import { issuesQueryFn } from "./issues-api";
import { useIssueMutations } from "./use-issue-mutations";
import type { Issue } from "./types";
import { issuesKey } from "./query-keys";

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
    queryKey: issuesKey(projectId ?? ""),
    queryFn: issuesQueryFn(projectId ?? ""),
    enabled,
  });

  return {
    issues: (data ?? NO_ISSUES) as Issue[],
    loading: enabled && isPending,
    error: error as Error | null,
    /** Takes the target project: the create dialog can pick another one. */
    createIssue: mutations.createIssue,
    updateIssue: mutations.updateIssue,
    moveIssue: mutations.moveIssue,
    setIssueCycle: mutations.setIssueCycle,
    setCategories: mutations.setCategories,
    deleteIssue: mutations.deleteIssue,
  };
}
