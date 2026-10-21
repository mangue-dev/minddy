"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchOAuthGrantsApi } from "./oauth-grants-api";

export const oauthGrantsQueryKey = ["oauth-grants"] as const;

/**
 * Applications connected via OAuth (active user grants). `refetchInterval`
 * polls while a screen waits for a consent given elsewhere (the agent opens
 * its own browser page, which this tab is never told about).
 */
export function useOAuthGrantsQuery({
  refetchInterval,
}: { refetchInterval?: number | false } = {}) {
  const { data, isPending } = useQuery({
    queryKey: oauthGrantsQueryKey,
    queryFn: fetchOAuthGrantsApi,
    refetchInterval,
  });
  return { grants: data?.grants ?? [], loading: isPending };
}
