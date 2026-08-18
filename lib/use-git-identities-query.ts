"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchGitIdentitiesApi } from "./git-integration-api";

export const gitIdentitiesQueryKey = ["git-identities"] as const;

/**
 * The user's PERSONAL git account (MIN-144) + the deployed providers —
 * which is what his actions on a pull request are based on. Not to be confused with
 * `useGitConnectionsQuery`, which talks about installing the GitHub App.
 */
export function useGitIdentitiesQuery(enabled = true) {
  const { data, isPending } = useQuery({
    queryKey: gitIdentitiesQueryKey,
    queryFn: fetchGitIdentitiesApi,
    enabled,
  });
  return {
    identities: data?.identities ?? [],
    providers: data?.providers ?? [],
    loading: enabled && isPending,
  };
}
