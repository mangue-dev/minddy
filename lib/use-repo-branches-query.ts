"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchIssueRepoBranchesApi, fetchProjectRepoBranchesApi } from "@/lib/agent-api";

/**
 * Branches du dépôt lié au projet de l'issue, pour le picker de branche de base
 * du composer d'agent. Passer `null` tant que le picker n'est pas visible (phase
 * live) évite l'appel provider. Erreur (pas de dépôt lié, provider en panne) →
 * liste vide, le picker retombe sur son libellé de défaut.
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
  const { data, isLoading } = useQuery({
    queryKey: issueRepoBranchesQueryKey(issueId ?? "none"),
    queryFn: () => fetchBranches(issueId as string),
    enabled: issueId != null,
    staleTime: 2 * 60 * 1000,
  });
  return {
    branches: data?.branches ?? [],
    defaultBranch: data?.defaultBranch ?? null,
    loading: isLoading,
  };
}

/** Variante ancrée PROJET (compose d'un run carnet, MIN-84) — mêmes garanties. */
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
  const { data, isLoading } = useQuery({
    queryKey: projectRepoBranchesQueryKey(projectId ?? "none"),
    queryFn: () => fetchProjectBranches(projectId as string),
    enabled: projectId != null,
    staleTime: 2 * 60 * 1000,
  });
  return {
    branches: data?.branches ?? [],
    defaultBranch: data?.defaultBranch ?? null,
    loading: isLoading,
  };
}
