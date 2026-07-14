"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchGitConnectionsApi } from "./git-integration-api";

export const gitConnectionsQueryKey = ["git-connections"] as const;

/** Connexions git du compte (sanitisées) + providers configurés. */
export function useGitConnectionsQuery() {
  const { data, isLoading } = useQuery({
    queryKey: gitConnectionsQueryKey,
    queryFn: fetchGitConnectionsApi,
  });
  return {
    connections: data?.connections ?? [],
    providers: data?.providers ?? [],
    loading: isLoading,
  };
}
