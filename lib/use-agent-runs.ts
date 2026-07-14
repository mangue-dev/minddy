"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchIssueAgentRunsApi, isAgentRunActive } from "./agent-api";

/** Clé de cache des runs d'agent d'une issue. */
export function issueAgentRunsQueryKey(issueId: string) {
  return ["agent-runs", "issue", issueId] as const;
}

/**
 * Runs de l'agent d'une issue, avec polling adaptatif : ~4 s tant qu'un run est
 * actif (queued/running/needs_input), sinon pas de polling.
 */
export function useIssueAgentRunsQuery(issueId: string | null) {
  const { data, isLoading } = useQuery({
    queryKey: issueAgentRunsQueryKey(issueId ?? ""),
    queryFn: () => fetchIssueAgentRunsApi(issueId as string),
    enabled: !!issueId,
    refetchInterval: (query) => {
      const runs = query.state.data?.runs ?? [];
      return runs.some((r) => isAgentRunActive(r.status)) ? 4000 : false;
    },
  });
  return { runs: data?.runs ?? [], loading: isLoading };
}
