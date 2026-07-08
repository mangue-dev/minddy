"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchOAuthGrantsApi } from "./oauth-grants-api";

export const oauthGrantsQueryKey = ["oauth-grants"] as const;

/** Applications connectées via OAuth (grants actifs de l'utilisateur). */
export function useOAuthGrantsQuery() {
  const { data, isLoading } = useQuery({
    queryKey: oauthGrantsQueryKey,
    queryFn: fetchOAuthGrantsApi,
  });
  return { grants: data?.grants ?? [], loading: isLoading };
}
