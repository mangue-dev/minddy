"use client";

import { useQuery } from "@tanstack/react-query";
import { DEFAULT_AGENT_PROVIDER, type AgentProviderId } from "@/lib/agent-providers";
import {
  reasoningLevelsFor,
  type ModelReasoning,
  type ReasoningLevel,
} from "@/lib/agent-reasoning";

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
  /**
   * Les paliers de raisonnement que ce modèle accepte, tels qu'il les publie.
   * Absent = rien de publié → le sélecteur montre les paliers génériques
   * (`reasoningLevelsFor`).
   */
  reasoning?: ModelReasoning | null;
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
  /**
   * Les ids CONSEILLÉS, dans l'ordre, et déjà restreints par le serveur à ceux
   * que `models` contient. Vide = pas de conseils applicables (BYOK aux ids
   * natifs, catalogue admin, liste vidée par l'admin) : le picker rouvre alors
   * sur le catalogue entier, comme avant.
   */
  recommended: string[];
}

async function fetchAgentModels(scope: AgentModelsScope): Promise<AgentModelsResult> {
  const empty = {
    provider: DEFAULT_AGENT_PROVIDER,
    defaultModel: null,
    models: [],
    maxMultiplier: null,
    planId: null,
    recommended: [],
  };
  const res = await fetch(SCOPE_ENDPOINTS[scope]);
  if (!res.ok) return empty;
  const data = (await res.json()) as {
    provider?: AgentProviderId;
    defaultModel?: string | null;
    models?: AgentModel[];
    maxMultiplier?: number | null;
    planId?: string | null;
    recommended?: string[];
  };
  return {
    provider: data.provider ?? DEFAULT_AGENT_PROVIDER,
    defaultModel: data.defaultModel ?? null,
    models: data.models ?? [],
    maxMultiplier: data.maxMultiplier ?? null,
    planId: data.planId ?? null,
    recommended: data.recommended ?? [],
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
    recommended: data?.recommended ?? [],
    loading: isPending,
  };
}

/**
 * Les paliers de raisonnement du modèle QUI VA TOURNER — celui que le composer
 * affiche, c'est-à-dire l'override choisi ou, à défaut, le défaut du compte.
 *
 * Le sélecteur ne peut pas les déduire seul : il ne connaît que sa valeur, pas le
 * modèle. Et c'est bien le modèle effectif qu'il faut, pas l'override : laisser
 * le champ « modèle par défaut » afficher les paliers génériques cacherait le
 * `xhigh` du modèle qui va réellement travailler.
 *
 * Le catalogue vient du cache de `useAgentModelsQuery` (même clé, aucune requête
 * de plus). Modèle inconnu ou catalogue pas encore arrivé → les paliers
 * génériques, le temps que la liste réponde.
 */
export function useReasoningLevelsFor(
  modelId: string | null | undefined,
  scope: AgentModelsScope = "user",
): ReasoningLevel[] {
  const { models } = useAgentModelsQuery(scope);
  const entry = modelId ? models.find((m) => m.id === modelId) : undefined;
  return reasoningLevelsFor(entry?.reasoning);
}
