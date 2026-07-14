"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * Catalogue de modèles OpenRouter pour le picker de l'agent (MIN-46). Alimenté
 * par `/api/agent/models` (proxy caché serveur). `staleTime` long : le
 * catalogue bouge lentement, inutile de le refetcher à chaque ouverture.
 */

export interface AgentModel {
  id: string;
  name: string;
}

export const agentModelsQueryKey = ["agent-models"] as const;

async function fetchAgentModels(): Promise<AgentModel[]> {
  const res = await fetch("/api/agent/models");
  if (!res.ok) return [];
  const data = (await res.json()) as { models?: AgentModel[] };
  return data.models ?? [];
}

export function useAgentModelsQuery() {
  const { data, isLoading } = useQuery({
    queryKey: agentModelsQueryKey,
    queryFn: fetchAgentModels,
    staleTime: 60 * 60 * 1000,
  });
  return { models: data ?? [], loading: isLoading };
}
