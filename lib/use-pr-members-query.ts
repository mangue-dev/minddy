"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPullRequestMembersApi, type PrEndpoint, type RepoMember } from "@/lib/agent-api";

/**
 * Forge accounts mentionable on a PR (MIN-162).
 *
 * Loaded ON DEMAND — `enabled` only becomes true at the first `@` typed, on
 * the model of __keep we write a comment, and the
 * response already carries its own HTTP cache.
 */
export function usePrMembersQuery(
  /** PR base: `/api/pull-requests/{id}` or facade `/api/agent-runs/{id}/pr`. */
  endpoint: PrEndpoint | null,
  enabled: boolean,
): { members: RepoMember[]; loading: boolean } {
  const on = enabled && !!endpoint;
  const { data, isPending } = useQuery({
    queryKey: ["pr-members", endpoint],
    queryFn: () => fetchPullRequestMembersApi(endpoint as PrEndpoint),
    enabled: on,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  return { members: data?.members ?? [], loading: on && isPending };
}
