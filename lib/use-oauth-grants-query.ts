"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchOAuthGrantsApi } from "./oauth-grants-api";

export const oauthGrantsQueryKey = ["oauth-grants"] as const;

/** Applications connected via OAuth (active user grants). */
export function useOAuthGrantsQuery() {
  const { data, isPending } = useQuery({
    queryKey: oauthGrantsQueryKey,
    queryFn: fetchOAuthGrantsApi,
  });
  return { grants: data?.grants ?? [], loading: isPending };
}
