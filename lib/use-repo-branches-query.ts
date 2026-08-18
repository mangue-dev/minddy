"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchIssueRepoBranchesApi, fetchProjectRepoBranchesApi } from "@/lib/agent-api";

/**
 * Branches from the repository linked to the issue's project, for the base branch picker
 * of the agent composer. Passing `null` while the picker is not visible (phase
 * live) avoids the provider call. Error (no linked repository, provider down) →
 * empty list, the picker falls back to its default label.
 */

export const issueRepoBranchesQueryKey = (issueId: string) =>
  ["issue-repo-branches", issueId] as const;

interface RepoBranchesResult {
  branches: string[];
  defaultBranch: string | null;
}

async function fetchBranches(issueId: string): Promise<RepoBranchesResult> {
  try {
    return await fetchIssueRepoBranchesApi(issueId);
  } catch {
    return { branches: [], defaultBranch: null };
  }
}

export function useIssueRepoBranchesQuery(issueId: string | null) {
  const enabled = issueId != null;
  const { data, isPending } = useQuery({
    queryKey: issueRepoBranchesQueryKey(issueId ?? "none"),
    queryFn: () => fetchBranches(issueId as string),
    enabled,
    staleTime: 2 * 60 * 1000,
  });
  return {
    branches: data?.branches ?? [],
    defaultBranch: data?.defaultBranch ?? null,
    loading: enabled && isPending,
  };
}

/** PROJECT anchored variant (composed of a run notebook, MIN-84) — same guarantees. */
export const projectRepoBranchesQueryKey = (projectId: string) =>
  ["project-repo-branches", projectId] as const;

async function fetchProjectBranches(projectId: string): Promise<RepoBranchesResult> {
  try {
    return await fetchProjectRepoBranchesApi(projectId);
  } catch {
    return { branches: [], defaultBranch: null };
  }
}

export function useProjectRepoBranchesQuery(projectId: string | null) {
  const enabled = projectId != null;
  const { data, isPending } = useQuery({
    queryKey: projectRepoBranchesQueryKey(projectId ?? "none"),
    queryFn: () => fetchProjectBranches(projectId as string),
    enabled,
    staleTime: 2 * 60 * 1000,
  });
  return {
    branches: data?.branches ?? [],
    defaultBranch: data?.defaultBranch ?? null,
    loading: enabled && isPending,
  };
}
