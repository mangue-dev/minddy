"use client";

import { useQuery } from "@tanstack/react-query";
import { DEFAULT_REASONING_LEVEL } from "./agent-reasoning";
import { fetchAgentPreferencesApi } from "./agent-keys-api";
import { DEFAULT_AGENT_BRANCH_PREFIX } from "./server/agent/branch-name";

export const agentPreferencesQueryKey = ["agent-preferences"] as const;

/**
 * Personal defaults of the agent: model, reasoning level, and branch prefix.
 */
export function useAgentPreferencesQuery() {
  const { data, isPending } = useQuery({
    queryKey: agentPreferencesQueryKey,
    queryFn: fetchAgentPreferencesApi,
  });
  return {
    defaultModel: data?.default_model ?? null,
    defaultReasoningLevel: data?.default_reasoning_level ?? DEFAULT_REASONING_LEVEL,
    branchPrefix: data?.branch_prefix ?? DEFAULT_AGENT_BRANCH_PREFIX,
    loading: isPending,
  };
}
