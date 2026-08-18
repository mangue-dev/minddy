"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchGitConnectionsApi } from "./git-integration-api";

export const gitConnectionsQueryKey = ["git-connections"] as const;

/**
 * Account git connections (sanitized) + providers configured.
 *
 * `enabled` because the creation wizard is permanently mounted (it lives
 * in `ProjectsProvider`): without guard, each page load would go
 * look for connections for a closed modal.
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
