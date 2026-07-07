"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApiKeysApi } from "./api-keys-api";

export const apiKeysQueryKey = ["api-keys"] as const;

/** The caller's personal API keys (names + prefixes only — never the key).
    Revoked rows are included so the settings list keeps their names. */
export function useApiKeysQuery() {
  const { data, isLoading } = useQuery({
    queryKey: apiKeysQueryKey,
    queryFn: fetchApiKeysApi,
  });
  return { apiKeys: data?.apiKeys ?? [], loading: isLoading };
}
