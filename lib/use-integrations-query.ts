"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchIntegrationsApi } from "./integrations-api";

export const integrationsQueryKey = (projectId: string) =>
  ["integrations", projectId] as const;

/** Project integrations (names, key prefixes, webhook state) — member-readable.
    Shared cache with the settings tab; revoked rows are included so issue
    attribution keeps resolving names forever. */
export function useIntegrationsQuery(projectId: string | null) {
  const { data, isLoading } = useQuery({
    queryKey: integrationsQueryKey(projectId ?? ""),
    queryFn: () => fetchIntegrationsApi(projectId as string),
    enabled: !!projectId,
  });
  return {
    integrations: data?.integrations ?? [],
    isOwner: !!data?.isOwner,
    loading: isLoading,
  };
}
