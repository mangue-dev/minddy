"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAiKeysApi } from "./agent-keys-api";

export const aiKeysQueryKey = ["ai-keys"] as const;

/** Clés BYOK du compte (sanitisées : provider + préfixe, jamais la clé). */
export function useAiKeysQuery() {
  const { data, isLoading } = useQuery({
    queryKey: aiKeysQueryKey,
    queryFn: fetchAiKeysApi,
  });
  return { keys: data?.keys ?? [], loading: isLoading };
}
