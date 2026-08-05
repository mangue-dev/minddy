"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchGitConnectionsApi } from "./git-integration-api";

export const gitConnectionsQueryKey = ["git-connections"] as const;

/**
 * Connexions git du compte (sanitisées) + providers configurés.
 *
 * `enabled` parce que le wizard de création est monté en permanence (il vit
 * dans `ProjectsProvider`) : sans garde, chaque chargement de page irait
 * chercher les connexions pour une modale fermée.
 */
export function useGitConnectionsQuery(enabled = true) {
  const { data, isPending } = useQuery({
    queryKey: gitConnectionsQueryKey,
    queryFn: fetchGitConnectionsApi,
    enabled,
  });
  return {
    connections: data?.connections ?? [],
    providers: data?.providers ?? [],
    loading: enabled && isPending,
  };
}
