"use client";

import { useQuery } from "@tanstack/react-query";
import { resolveSandboxPreferences } from "./agent-sandbox-config";
import { normalizeNativeModelPreferences } from "./native-agent-models";
import { DEFAULT_REASONING_LEVEL } from "./agent-reasoning";
import { fetchAgentPreferencesApi } from "./agent-keys-api";
import { DEFAULT_AGENT_BRANCH_PREFIX } from "./server/agent/branch-name";

export const agentPreferencesQueryKey = ["agent-preferences"] as const;

/**
 * Personal worker defaults. Native login capabilities stay outside this query.
 */
export function useAgentPreferencesQuery() {
  const { data, isPending, error } = useQuery({
    queryKey: agentPreferencesQueryKey,
    queryFn: fetchAgentPreferencesApi,
  });
  return {
    ...resolveSandboxPreferences(data),
    defaultEngine: data?.default_engine ?? "opencode",
    nativeAgentsEnabled: data?.native_agents_enabled ?? false,
    nativeModelPreferences: normalizeNativeModelPreferences(data?.native_model_preferences),
    defaultModel: data?.default_model ?? null,
    defaultReasoningLevel: data?.default_reasoning_level ?? DEFAULT_REASONING_LEVEL,
    branchPrefix: data?.branch_prefix ?? DEFAULT_AGENT_BRANCH_PREFIX,
    loading: isPending,
    error,
  };
}
