"use client";

import { useQuery } from "@tanstack/react-query";
import type { BranchCleanupTarget } from "./types";

/**
 * Projects where agent branch housekeeping (MIN-102) is offered — one per line
 * of the command palette, regardless of page. A single query for all
 * my projects, where querying the git link on a project-by-project basis would cost
 * as many as I have projects.
 */
export const branchCleanupTargetsQueryKey = ["me", "branch-cleanup-targets"] as const;

async function fetchTargets(): Promise<BranchCleanupTarget[]> {
  const res = await fetch("/api/me/branch-cleanup-targets");
  if (!res.ok) throw new Error("Failed to load branch cleanup targets");
  const data = (await res.json()) as { targets?: BranchCleanupTarget[] };
  return data.targets ?? [];
}

export function useBranchCleanupTargets(): BranchCleanupTarget[] {
  const { data } = useQuery({
    queryKey: branchCleanupTargetsQueryKey,
    queryFn: fetchTargets,
    // The list only moves when linking a repository or launching a first agent:
    // one reading per hour is more than enough, the persistent cache does the rest.
    staleTime: 60 * 60_000,
  });
  return data ?? [];
}
