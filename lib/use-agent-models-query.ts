"use client";

import { useQuery } from "@tanstack/react-query";
import { DEFAULT_AGENT_PROVIDER, type AgentProviderId } from "@/lib/agent-providers";
import { getDesktopBridge } from "@/lib/desktop/bridge";
import {
  reasoningLevelsFor,
  type ModelReasoning,
  type ReasoningLevel,
} from "@/lib/agent-reasoning";

/**
 * Model catalog for the picker (MIN-46). `staleTime` long: the catalog
 * moves slowly. The query key is invalidated when the BYOK changes
 * (see account-ai-keys-section) → the provider and the list are refreshed.
 *
 * Three scopes:
 * - `user` (default) → `/api/agent/models`, the ACTIVE provider of the account (its
 * BYOK or the platform key): what ITS agent can launch;
 * - `platform` → `/api/admin/models-catalog`, the OpenRouter platform key
 * without tool-calling filter, for the config admin (MIN-90). The admin's BYOK
 * has nothing to do there: `app_config` runs on the platform;
 * - `review` → `/api/agent/review-models`, the platform key WITH the filter
 * tool-calling, for choosing the review model of a PR: this pass
 * runs on the platform and forces a tool call, whatever the BYOK of the
 * account.
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
  /** Default model of the active provider (BYOK border or root default), or null. */
  defaultModel: string | null;
  models: AgentModel[];
  /**
 * Plan multiplier cap, or null when none applies (BYOK,
 * admin catalog) — the picker then displays neither multiplier nor grayed out.
 */
  maxMultiplier: number | null;
  /** Account plan, to name it in the explanation of the limit. */
  planId: string | null;
  /**
 * The RECOMMENDED ids, in order, and already restricted by the server to those
 * that `models` contains. Empty = no advice applicable (BYOK to native ids
 *, admin catalog, list emptied by admin): the picker then reopens
 * on the entire catalog, as before.
 */
  recommended: string[];
  /** The cloud backend can actually launch a session on this instance. */
  cloudExecutionConfigured: boolean;
  /** Scheduled task routes are protected and can be scheduled. */
  routineSchedulingConfigured: boolean;
  /** Non-secret local config: its catalog is read by the Electron shell. */
  localEndpoint?: {
    provider: "local_openai" | "ollama";
    baseUrl: string;
  };
}

async function fetchAgentModels(scope: AgentModelsScope): Promise<AgentModelsResult> {
  const empty = {
    provider: DEFAULT_AGENT_PROVIDER,
    defaultModel: null,
    models: [],
    maxMultiplier: null,
    planId: null,
    recommended: [],
    cloudExecutionConfigured: false,
    routineSchedulingConfigured: false,
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
    cloudExecutionConfigured?: boolean;
    routineSchedulingConfigured?: boolean;
    localEndpoint?: {
      provider?: AgentProviderId;
      baseUrl?: string;
    };
  };
  const localEndpoint: AgentModelsResult["localEndpoint"] =
    data.localEndpoint &&
    (data.localEndpoint.provider === "local_openai" || data.localEndpoint.provider === "ollama") &&
    typeof data.localEndpoint.baseUrl === "string" &&
    data.localEndpoint.baseUrl
      ? { provider: data.localEndpoint.provider, baseUrl: data.localEndpoint.baseUrl }
      : undefined;
  const catalog: AgentModelsResult = {
    provider: data.provider ?? DEFAULT_AGENT_PROVIDER,
    defaultModel: data.defaultModel ?? null,
    models: data.models ?? [],
    maxMultiplier: data.maxMultiplier ?? null,
    planId: data.planId ?? null,
    recommended: data.recommended ?? [],
    // An unknown ability remains unavailable: activate it during a failure or
    // a loading would offer an action which the server will then refuse in 503.
    cloudExecutionConfigured: data.cloudExecutionConfigured ?? false,
    routineSchedulingConfigured: data.routineSchedulingConfigured ?? false,
    ...(localEndpoint ? { localEndpoint } : {}),
  };
  // The web server can never — and should — never attach a local address.
  // The desktop app does this behind a bounded loopback bridge, then picks it
  // receives exactly the same contract as a cloud catalog.
  const bridge = scope === "user" && catalog.localEndpoint ? getDesktopBridge() : null;
  if (!bridge || !catalog.localEndpoint) return catalog;
  const discovered = await bridge.discoverLocalModels(catalog.localEndpoint).catch(() => null);
  return discovered?.ok
    ? { ...catalog, models: discovered.models.map((id) => ({ id, name: id })) }
    : catalog;
}

export function useAgentModelsQuery(scope: AgentModelsScope = "user") {
  const { data, isPending } = useQuery({
    // One scope = one catalog: the two should never share a cache.
    queryKey: scope === "user" ? agentModelsQueryKey : [...agentModelsQueryKey, scope],
    queryFn: () => fetchAgentModels(scope),
    // Cloud catalogs are hidden on the server side; one minute allows
    // revenge to Ollama / LM Studio, freshly started, appears quickly without
    // refresh button nor local access from the cloud.
    staleTime: 60 * 1000,
  });
  return {
    provider: data?.provider ?? DEFAULT_AGENT_PROVIDER,
    defaultModel: data?.defaultModel ?? null,
    models: data?.models ?? [],
    maxMultiplier: data?.maxMultiplier ?? null,
    planId: data?.planId ?? null,
    recommended: data?.recommended ?? [],
    cloudExecutionConfigured: data?.cloudExecutionConfigured ?? false,
    routineSchedulingConfigured: data?.routineSchedulingConfigured ?? false,
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
  scope: AgentModelsScope = "user",
): ReasoningLevel[] {
  const { models } = useAgentModelsQuery(scope);
  const entry = modelId ? models.find((m) => m.id === modelId) : undefined;
  return reasoningLevelsFor(entry?.reasoning);
}
