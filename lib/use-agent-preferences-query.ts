"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAgentPreferencesApi } from "./agent-keys-api";

export const agentPreferencesQueryKey = ["agent-preferences"] as const;

/** Modèle par défaut perso de l'utilisateur (null = défaut racine). */
export function useAgentPreferencesQuery() {
  const { data, isLoading } = useQuery({
    queryKey: agentPreferencesQueryKey,
    queryFn: fetchAgentPreferencesApi,
  });
  return { defaultModel: data?.default_model ?? null, loading: isLoading };
}
