"use client";
import { useQuery } from "@tanstack/react-query";
import type { AgentProviderId } from "./agent-providers";
export type NumoPreferences = { provider: AgentProviderId; default_model: string | null; application_model: string | null };
export const numoPreferencesQueryKey = ["numo-preferences"] as const;
async function requestNumoPreferences(patch?: Pick<NumoPreferences, "provider" | "default_model">): Promise<NumoPreferences> {
  const response = await fetch("/api/account/numo-preferences", {
    method: patch ? "PUT" : "GET", cache: "no-store",
    ...(patch ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) } : {}),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Could not save Numo preferences");
  return body;
}
export const saveNumoPreferencesApi = (patch: Pick<NumoPreferences, "provider" | "default_model">) => requestNumoPreferences(patch);
export function useNumoPreferencesQuery() {
  return useQuery({ queryKey: numoPreferencesQueryKey, queryFn: () => requestNumoPreferences() });
}
