"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchGitIdentitiesApi } from "./git-integration-api";

export const gitIdentitiesQueryKey = ["git-identities"] as const;

/**
 * Le compte git PERSONNEL de l'utilisateur (MIN-144) + les providers déployés —
 * ce sous quoi partent ses gestes sur une pull request. À ne pas confondre avec
 * `useGitConnectionsQuery`, qui parle de l'installation de la GitHub App.
 */
export function useGitIdentitiesQuery(enabled = true) {
  const { data, isLoading } = useQuery({
    queryKey: gitIdentitiesQueryKey,
    queryFn: fetchGitIdentitiesApi,
    enabled,
  });
  return {
    identities: data?.identities ?? [],
    providers: data?.providers ?? [],
    loading: isLoading,
  };
}
