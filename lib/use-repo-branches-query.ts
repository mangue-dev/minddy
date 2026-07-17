"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchIssueRepoBranchesApi } from "@/lib/agent-api";

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
