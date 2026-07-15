"use client";

import { useQuery } from "@tanstack/react-query";
import { DEFAULT_AGENT_PROVIDER, type AgentProviderId } from "@/lib/agent-providers";

/**
 * Catalogue de modèles du provider ACTIF (BYOK ou clé plateforme) pour le picker
 * de l'agent (MIN-46). Alimenté par `/api/agent/models`. `staleTime` long : le
 * catalogue bouge lentement. La clé de query est invalidée quand le BYOK change
 * (cf. account-ai-keys-section) → le provider et la liste se rafraîchissent.
 */

export interface AgentModel {
  id: string;
  name: string;
}

export const agentModelsQueryKey = ["agent-models"] as const;

interface AgentModelsResult {
  provider: AgentProviderId;
  /** Modèle par défaut du provider actif (frontier BYOK ou défaut racine), ou null. */
  defaultModel: string | null;
  models: AgentModel[];
}

async function fetchAgentModels(): Promise<AgentModelsResult> {
  const res = await fetch("/api/agent/models");
  if (!res.ok) return { provider: DEFAULT_AGENT_PROVIDER, defaultModel: null, models: [] };
  const data = (await res.json()) as {
    provider?: AgentProviderId;
    defaultModel?: string | null;
    models?: AgentModel[];
  };
  return {
    provider: data.provider ?? DEFAULT_AGENT_PROVIDER,
    defaultModel: data.defaultModel ?? null,
    models: data.models ?? [],
  };
}

export function useAgentModelsQuery() {
  const { data, isLoading } = useQuery({
    queryKey: agentModelsQueryKey,
    queryFn: fetchAgentModels,
    staleTime: 60 * 60 * 1000,
  });
  return {
    provider: data?.provider ?? DEFAULT_AGENT_PROVIDER,
    defaultModel: data?.defaultModel ?? null,
    models: data?.models ?? [],
    loading: isLoading,
  };
}
