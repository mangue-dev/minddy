"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchAgentRunEventsApi,
  fetchAgentRunPrApi,
  fetchAllPullRequestsApi,
  fetchIssueAgentRunsApi,
  fetchPrCommentsApi,
  isAgentRunWorking,
} from "./agent-api";

/** Clé de cache des runs d'agent d'une issue. */
export function issueAgentRunsQueryKey(issueId: string) {
  return ["agent-runs", "issue", issueId] as const;
}

/**
 * Runs de l'agent d'une issue, avec polling adaptatif : ~3 s tant que l'agent
 * TRAVAILLE (queued/running), sinon pas de polling. Une session au repos
 * (needs_input) ne change pas toute seule — une action utilisateur (steer/relance)
 * invalide la query et relance le polling quand l'agent repart.
 */
export function useIssueAgentRunsQuery(issueId: string | null) {
  const { data, isLoading } = useQuery({
    queryKey: issueAgentRunsQueryKey(issueId ?? ""),
    queryFn: () => fetchIssueAgentRunsApi(issueId as string),
    enabled: !!issueId,
    refetchInterval: (query) => {
      const runs = query.state.data?.runs ?? [];
      return runs.some((r) => isAgentRunWorking(r.status)) ? 3000 : false;
    },
  });
  return { runs: data?.runs ?? [], loading: isLoading };
}

/** Events du live view d'un run : polling ~2 s tant que le run est actif. */
export function useAgentRunEventsQuery(runId: string, active: boolean) {
  const { data, isLoading } = useQuery({
    queryKey: ["agent-run-events", runId],
    queryFn: () => fetchAgentRunEventsApi(runId),
    refetchInterval: active ? 2000 : false,
  });
  return { events: data?.events ?? [], loading: isLoading };
}

/** PR d'un run (metadata + fichiers/patches) pour la review in-app. */
export function useAgentRunPrQuery(runId: string, enabled: boolean) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["agent-run-pr", runId],
    queryFn: () => fetchAgentRunPrApi(runId),
    enabled,
  });
  return { pr: data?.pr ?? null, files: data?.files ?? [], loading: isLoading, refetch };
}

/** Clé de cache de la liste globale des PR (MIN-66). */
export const allPullRequestsQueryKey = ["pull-requests", "all"] as const;

/**
 * Liste globale des PR de Numo (page Pull Requests). Polling ~5 s tant qu'une PR
 * a un run actif (Numo retravaille dessus), sinon pas de polling.
 */
export function useAllPullRequestsQuery() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: allPullRequestsQueryKey,
    queryFn: fetchAllPullRequestsApi,
    refetchInterval: (query) => {
      const prs = query.state.data?.pullRequests ?? [];
      return prs.some((p) => p.activeRunId) ? 5000 : false;
    },
  });
  return { pullRequests: data?.pullRequests ?? [], loading: isLoading, refetch };
}

/** Fil de conversation d'une PR (commentaires GitHub). */
export function usePrCommentsQuery(runId: string | null) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["pr-comments", runId],
    queryFn: () => fetchPrCommentsApi(runId as string),
    enabled: !!runId,
  });
  return { comments: data?.comments ?? [], loading: isLoading, refetch };
}
