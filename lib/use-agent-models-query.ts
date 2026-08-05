"use client";

import { useQuery } from "@tanstack/react-query";
import { DEFAULT_AGENT_PROVIDER, type AgentProviderId } from "@/lib/agent-providers";

/**
 * Catalogue de modèles pour le picker (MIN-46). `staleTime` long : le catalogue
 * bouge lentement. La clé de query est invalidée quand le BYOK change
 * (cf. account-ai-keys-section) → le provider et la liste se rafraîchissent.
 *
 * Trois portées :
 *  - `user` (défaut) → `/api/agent/models`, le provider ACTIF du compte (son
 *    BYOK ou la clé plateforme) : ce que SON agent peut lancer ;
 *  - `platform` → `/api/admin/models-catalog`, la clé plateforme OpenRouter
 *    sans filtre tool-calling, pour la config admin (MIN-90). Le BYOK de l'admin
 *    n'a rien à faire là : `app_config` tourne sur la plateforme ;
 *  - `review` → `/api/agent/review-models`, la clé plateforme AVEC le filtre
 *    tool-calling, pour le choix du modèle de review d'une PR : cette passe
 *    tourne sur la plateforme et force un tool call, quel que soit le BYOK du
 *    compte.
 */

export type AgentModelsScope = "user" | "platform" | "review";

const SCOPE_ENDPOINTS: Record<AgentModelsScope, string> = {
  user: "/api/agent/models",
  platform: "/api/admin/models-catalog",
  review: "/api/agent/review-models",
};

export interface AgentModel {
  id: string;
  name: string;
  /** Coût d'usage relatif au modèle par défaut de minddy (lib/model-multiplier.ts). */
  multiplier?: number;
}

export const agentModelsQueryKey = ["agent-models"] as const;

interface AgentModelsResult {
  provider: AgentProviderId;
  /** Modèle par défaut du provider actif (frontier BYOK ou défaut racine), ou null. */
  defaultModel: string | null;
  models: AgentModel[];
  /**
   * Plafond de multiplicateur du plan, ou null quand aucun ne s'applique (BYOK,
   * catalogue admin) — le picker n'affiche alors ni multiplicateur ni grisé.
   */
  maxMultiplier: number | null;
  /** Plan du compte, pour le nommer dans l'explication du plafond. */
  planId: string | null;
}

async function fetchAgentModels(scope: AgentModelsScope): Promise<AgentModelsResult> {
  const empty = {
    provider: DEFAULT_AGENT_PROVIDER,
    defaultModel: null,
    models: [],
    maxMultiplier: null,
    planId: null,
  };
  const res = await fetch(SCOPE_ENDPOINTS[scope]);
  if (!res.ok) return empty;
  const data = (await res.json()) as {
    provider?: AgentProviderId;
    defaultModel?: string | null;
    models?: AgentModel[];
    maxMultiplier?: number | null;
    planId?: string | null;
  };
  return {
    provider: data.provider ?? DEFAULT_AGENT_PROVIDER,
    defaultModel: data.defaultModel ?? null,
    models: data.models ?? [],
    maxMultiplier: data.maxMultiplier ?? null,
    planId: data.planId ?? null,
  };
}

export function useAgentModelsQuery(scope: AgentModelsScope = "user") {
  const { data, isPending } = useQuery({
    // Une portée = un catalogue : les deux ne doivent jamais partager un cache.
    queryKey: scope === "user" ? agentModelsQueryKey : [...agentModelsQueryKey, scope],
    queryFn: () => fetchAgentModels(scope),
    staleTime: 60 * 60 * 1000,
  });
  return {
    provider: data?.provider ?? DEFAULT_AGENT_PROVIDER,
    defaultModel: data?.defaultModel ?? null,
    models: data?.models ?? [],
    maxMultiplier: data?.maxMultiplier ?? null,
    planId: data?.planId ?? null,
    loading: isPending,
  };
}
