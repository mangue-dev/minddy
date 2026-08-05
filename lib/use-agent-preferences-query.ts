"use client";

import { useQuery } from "@tanstack/react-query";
import { DEFAULT_REASONING_LEVEL } from "./agent-reasoning";
import { fetchAgentPreferencesApi } from "./agent-keys-api";

export const agentPreferencesQueryKey = ["agent-preferences"] as const;

/**
 * Défauts perso de l'agent : le modèle (null = défaut racine) et le niveau de
 * raisonnement (MIN-122 — null en base = `off`).
 */
export function useAgentPreferencesQuery() {
  const { data, isPending } = useQuery({
    queryKey: agentPreferencesQueryKey,
    queryFn: fetchAgentPreferencesApi,
  });
  return {
    defaultModel: data?.default_model ?? null,
    defaultReasoningLevel: data?.default_reasoning_level ?? DEFAULT_REASONING_LEVEL,
    loading: isPending,
  };
}
