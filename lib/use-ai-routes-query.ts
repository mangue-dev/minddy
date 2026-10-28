"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AiProviderChoice, ByokModelKey } from "./ai-surfaces";
import type { AiProviderOption } from "./ai-provider-options";
import { agentModelsQueryKey } from "./use-agent-models-query";
import { aiKeysQueryKey } from "./use-ai-keys-query";

/** The provider of each AI call type, and the providers each one can choose (MIN-826). */
export interface AiRoutesState {
  routes: Record<ByokModelKey, AiProviderChoice>;
  options: Record<ByokModelKey, AiProviderOption[]>;
}

export type AiRoutePatch = { usage: ByokModelKey; provider: AiProviderChoice };

export const aiRoutesQueryKey = ["ai-routes"] as const;

async function requestAiRoutes(patch?: AiRoutePatch): Promise<AiRoutesState> {
  const response = await fetch("/api/account/ai-routes", {
    method: patch ? "PUT" : "GET", cache: "no-store",
    ...(patch ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) } : {}),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? "Could not save the AI usage");
  return body as AiRoutesState;
}

export function useAiRoutesQuery() {
  return useQuery({ queryKey: aiRoutesQueryKey, queryFn: () => requestAiRoutes() });
}

/** Routes one call type optimistically; the previous route comes back on refusal. */
export function useSetAiRoute(onError: (error: Error) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: AiRoutePatch) => requestAiRoutes(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: aiRoutesQueryKey });
      const previous = queryClient.getQueryData<AiRoutesState>(aiRoutesQueryKey);
      if (previous) {
        queryClient.setQueryData<AiRoutesState>(aiRoutesQueryKey, {
          ...previous,
          routes: { ...previous.routes, [patch.usage]: patch.provider },
        });
      }
      return { previous };
    },
    onError: (error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(aiRoutesQueryKey, context.previous);
      onError(error as Error);
    },
    onSuccess: (saved) => queryClient.setQueryData(aiRoutesQueryKey, saved),
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: aiKeysQueryKey }),
      queryClient.invalidateQueries({ queryKey: agentModelsQueryKey }),
    ]),
  });
}
