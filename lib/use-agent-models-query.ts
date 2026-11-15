"use client";

import { useQuery } from "@tanstack/react-query";
import { DEFAULT_AGENT_PROVIDER, type AgentProviderId } from "@/lib/agent-providers";
import { catalogModelReasoning } from "@/lib/model-reasoning-rules";
import type { AiProviderChoice } from "@/lib/ai-surfaces";
import type { AiProviderOption } from "@/lib/ai-provider-options";
import {
  reasoningLevelsFor,
  type ModelReasoning,
  type ReasoningLevel,
} from "@/lib/agent-reasoning";
import type { AdminCatalogCapability } from "@/lib/model-catalog-capability";
import { fetchSeeded } from "@/lib/server-seed";

/**
 * Model catalog for the picker (MIN-46). The query key is invalidated when a
 * BYOK credential changes (byok-connect-panel), refreshing provider and list.
 *
 * Three scopes:
 * - `assistant` → `/api/assistant/models`, the provider serving Numo (BYOK or
 *   the platform key) and its reasoning default;
 * - `byok` → `/api/account/byok-models`, the active BYOK provider filtered by
 *   runtime capability for account settings;
 * - `platform` → `/api/admin/models-catalog`, the OpenRouter platform key
 * filtered by the requested runtime capability for the config admin (MIN-90).
 * The admin's BYOK has nothing to do there: `app_config` runs on the platform;
 */

export type AgentModelsScope = "assistant" | "byok" | "platform";

const SCOPE_ENDPOINTS: Record<AgentModelsScope, string> = {
  assistant: "/api/assistant/models",
  byok: "/api/account/byok-models",
  platform: "/api/admin/models-catalog",
};

export interface AgentModel {
  id: string;
  name: string;
  /** Usage cost relating to the default minddy model (lib/model-multiplier.ts). */
  multiplier?: number;
  /**
 * The reasoning levels that this model accepts, as it publishes them.
 * Absent = nothing published → the selector shows generic levels
 * (`reasoningLevelsFor`).
 */
  reasoning?: ModelReasoning | null;
}

export const agentModelsQueryKey = ["agent-models"] as const;

interface AgentModelsResult {
  provider: AgentProviderId;
  /** Account model when it belongs to the active provider, otherwise null. */
  defaultModel: string | null;
  models: AgentModel[];
  /**
 * Plan multiplier cap, or null when none applies (BYOK or the admin catalog)
 * — the picker then displays neither multiplier nor grayed-out models.
 */
  maxMultiplier: number | null;
  /** Account plan, to name it in the explanation of the limit. */
  planId: string | null;
  /**
   * The recommended ids, in order, restricted by the server to `models`.
   * Empty when no advice applies (BYOK with native ids, admin catalog, list
   * emptied by an admin): the picker then shows the whole catalog.
   */
  recommended: string[];
  /** Instance default used by Numo when a conversation has no override. */
  defaultReasoning?: ReasoningLevel;
  /** The provider this catalog lists (`assistant` scope, MIN-826). */
  providerChoice?: AiProviderChoice | null;
  /** Numo's default provider for the account. */
  defaultProvider?: AiProviderChoice | null;
  /** Providers the account can choose for Numo. */
  providers?: AiProviderOption[];
  /** The instance sets this provider's Numo model and reasoning (MIN-954). */
  modelLocked?: boolean;
}

export async function fetchAgentModels(
  scope: AgentModelsScope,
  capability: AdminCatalogCapability,
  provider?: AiProviderChoice | null,
): Promise<AgentModelsResult> {
  const empty = {
    provider: DEFAULT_AGENT_PROVIDER,
    defaultModel: null,
    models: [],
    maxMultiplier: null,
    planId: null,
    recommended: [],
    defaultReasoning: undefined,
  };
  const params = new URLSearchParams();
  if (scope === "platform" || scope === "byok") params.set("capability", capability);
  if (provider && (scope === "assistant" || scope === "byok")) params.set("provider", provider);
  const endpoint = params.size > 0
    ? `${SCOPE_ENDPOINTS[scope]}?${params.toString()}`
    : SCOPE_ENDPOINTS[scope];
  const res = await fetchSeeded(endpoint);
  if (!res.ok) return empty;
  const data = (await res.json()) as {
    provider?: AgentProviderId;
    defaultModel?: string | null;
    models?: AgentModel[];
    maxMultiplier?: number | null;
    planId?: string | null;
    recommended?: string[];
    defaultReasoning?: ReasoningLevel;
    providerChoice?: AiProviderChoice | null;
    defaultProvider?: AiProviderChoice | null;
    providers?: AiProviderOption[];
    modelLocked?: boolean;
  };
  return {
    provider: data.provider ?? DEFAULT_AGENT_PROVIDER,
    defaultModel: data.defaultModel ?? null,
    models: data.models ?? [],
    maxMultiplier: data.maxMultiplier ?? null,
    planId: data.planId ?? null,
    recommended: data.recommended ?? [],
    defaultReasoning: data.defaultReasoning,
    providerChoice: data.providerChoice ?? null,
    defaultProvider: data.defaultProvider ?? null,
    providers: data.providers ?? [],
    modelLocked: data.modelLocked ?? false,
  };
}

export function useAgentModelsQuery(
  scope: AgentModelsScope,
  capability: AdminCatalogCapability = "text",
  /** One provider's catalog instead of the usage's route (MIN-826). */
  provider?: AiProviderChoice | null,
) {
  const { data, isPending } = useQuery({
    // One scope = one catalog: two scopes never share a cache entry.
    queryKey: [...agentModelsQueryKey, scope, capability, provider ?? "route"],
    queryFn: () => fetchAgentModels(scope, capability, provider),
    staleTime: 60 * 1000,
  });
  return {
    provider: data?.provider ?? DEFAULT_AGENT_PROVIDER,
    defaultModel: data?.defaultModel ?? null,
    models: data?.models ?? [],
    maxMultiplier: data?.maxMultiplier ?? null,
    planId: data?.planId ?? null,
    recommended: data?.recommended ?? [],
    defaultReasoning: data?.defaultReasoning,
    providerChoice: data?.providerChoice ?? null,
    defaultProvider: data?.defaultProvider ?? null,
    providers: data?.providers ?? [],
    modelLocked: data?.modelLocked ?? false,
    loading: isPending,
  };
}

/**
 * The reasoning levels of the model THAT WILL TURN — the one that the composer
 * displays, that is to say the chosen override or, failing that, the default of the account.
 *
 * The selector cannot deduce them alone: it only knows its value, not the
 * model. And it is the actual model that is needed, not the override: letting
 * the "default model" field display the generic levels would hide the
 * `xhigh` of the model which will actually work.
 *
 * The catalog comes from the `useAgentModelsQuery` cache (same key, no
 * queries). Unknown model or catalog not yet arrived → generic
 * levels, while the list responds.
 */
export function useReasoningLevelsFor(
  modelId: string | null | undefined,
  scope: AgentModelsScope,
  providerChoice?: AiProviderChoice | null,
): ReasoningLevel[] {
  const { models, provider } = useAgentModelsQuery(scope, "text", providerChoice);
  const entry = modelId ? models.find((m) => m.id === modelId) : undefined;
  return reasoningLevelsFor(catalogModelReasoning(provider, modelId, entry));
}
