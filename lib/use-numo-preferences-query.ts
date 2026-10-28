"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AiProviderChoice } from "./ai-surfaces";
import type { AiProviderOption } from "./ai-provider-options";
import { apiErrorCode, HttpResponseError } from "./backend-availability";
import { agentModelsQueryKey } from "./use-agent-models-query";
import { aiRoutesQueryKey } from "./use-ai-routes-query";

/** Numo's account defaults: its provider (the Numo usage route) and that provider's model. */
export type NumoPreferences = {
  provider: AiProviderChoice;
  default_model: string | null;
  application_model: string | null;
  providers: AiProviderOption[];
};
export type NumoPreferencesPatch = Pick<NumoPreferences, "provider" | "default_model">;
export const numoPreferencesQueryKey = ["numo-preferences"] as const;

async function requestNumoPreferences(patch?: NumoPreferencesPatch): Promise<NumoPreferences> {
  const response = await fetch("/api/account/numo-preferences", {
    method: patch ? "PUT" : "GET", cache: "no-store",
    ...(patch ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) } : {}),
  });
  // A gateway or timeout page is not JSON: keep the HTTP status instead of a parse error.
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new HttpResponseError(body?.error ?? (patch ? "Could not save Numo preferences" : "Could not load Numo preferences"),
      response.status, apiErrorCode(body));
  }
  return { providers: [], ...body };
}
export const saveNumoPreferencesApi = (patch: NumoPreferencesPatch) => requestNumoPreferences(patch);
export function useNumoPreferencesQuery() {
  return useQuery({ queryKey: numoPreferencesQueryKey, queryFn: () => requestNumoPreferences() });
}

/**
 * Saves Numo's default provider and model optimistically: the settings show
 * the choice at once and roll back if the server refuses it.
 */
export function useSaveNumoPreferences(onError: (error: Error) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveNumoPreferencesApi,
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: numoPreferencesQueryKey });
      const previous = queryClient.getQueryData<NumoPreferences>(numoPreferencesQueryKey);
      if (previous) {
        queryClient.setQueryData<NumoPreferences>(numoPreferencesQueryKey, {
          ...previous,
          ...patch,
          // A new provider's application default is unknown until the server answers.
          application_model: patch.provider === previous.provider ? previous.application_model : null,
        });
      }
      return { previous };
    },
    onError: (error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(numoPreferencesQueryKey, context.previous);
      onError(error as Error);
    },
    onSuccess: (saved) => queryClient.setQueryData(numoPreferencesQueryKey, saved),
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: agentModelsQueryKey }),
      queryClient.invalidateQueries({ queryKey: aiRoutesQueryKey }),
    ]),
  });
}
