"use client";
import { useQuery } from "@tanstack/react-query";
import type { AgentProviderId } from "./agent-providers";
import { apiErrorCode, HttpResponseError } from "./backend-availability";
export type NumoPreferences = { provider: AgentProviderId; default_model: string | null; application_model: string | null };
export const numoPreferencesQueryKey = ["numo-preferences"] as const;
async function requestNumoPreferences(patch?: Pick<NumoPreferences, "provider" | "default_model">): Promise<NumoPreferences> {
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
  return body;
}
export const saveNumoPreferencesApi = (patch: Pick<NumoPreferences, "provider" | "default_model">) => requestNumoPreferences(patch);
export function useNumoPreferencesQuery() {
  return useQuery({ queryKey: numoPreferencesQueryKey, queryFn: () => requestNumoPreferences() });
}
