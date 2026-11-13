"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AiProviderChoice } from "./ai-surfaces";
import type { AiProviderOption } from "./ai-provider-options";
import type { DecisionEngine } from "./decision-engine";

/** The account's decision settings (MIN-980), as `/api/account/ai-decisions` returns them. */
export interface AiDecisionSettings {
  instance_engine: DecisionEngine;
  /** The account's own engine, or null to follow the instance. */
  engine: DecisionEngine | null;
  /** Null: automatic. */
  provider: AiProviderChoice | null;
  model: string | null;
  default_model: string | null;
  providers: AiProviderOption[];
}

export type AiDecisionPatch = {
  engine?: DecisionEngine | null;
  provider?: AiProviderChoice | null;
  model?: string | null;
};

export const aiDecisionsQueryKey = ["ai-decisions"] as const;

async function requestAiDecisions(patch?: AiDecisionPatch): Promise<AiDecisionSettings> {
  const response = await fetch("/api/account/ai-decisions", {
    method: patch ? "PUT" : "GET", cache: "no-store",
    ...(patch ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) } : {}),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? "Could not save the decision settings");
  return body as AiDecisionSettings;
}

export function useAiDecisionsQuery() {
  return useQuery({ queryKey: aiDecisionsQueryKey, queryFn: () => requestAiDecisions() });
}

/** Saves a change optimistically; the previous settings come back on refusal. */
export function useSaveAiDecisions(onError: (error: Error) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: AiDecisionPatch) => requestAiDecisions(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: aiDecisionsQueryKey });
      const previous = queryClient.getQueryData<AiDecisionSettings>(aiDecisionsQueryKey);
      if (previous) queryClient.setQueryData<AiDecisionSettings>(aiDecisionsQueryKey, { ...previous, ...patch });
      return { previous };
    },
    onError: (error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(aiDecisionsQueryKey, context.previous);
      onError(error as Error);
    },
    onSuccess: (saved) => queryClient.setQueryData(aiDecisionsQueryKey, saved),
  });
}
