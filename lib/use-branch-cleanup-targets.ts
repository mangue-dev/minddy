"use client";

import { useQuery } from "@tanstack/react-query";
import type { BranchCleanupTarget } from "./types";

/**
 * Projets où le ménage des branches d'agent (MIN-102) est offert — un par ligne
 * de la command palette, quelle que soit la page. Une seule requête pour tous
 * mes projets, là où interroger la liaison git projet par projet en coûterait
 * autant que j'ai de projets.
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
    // La liste ne bouge qu'en liant un dépôt ou en lançant un premier agent :
    // une lecture par heure suffit largement, le cache persisté fait le reste.
    staleTime: 60 * 60_000,
  });
  return data ?? [];
}
