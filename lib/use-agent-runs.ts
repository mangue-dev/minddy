"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchAgentRunEventsApi,
  fetchAgentRunPrApi,
  fetchAgentSessionsApi,
  fetchAllPullRequestsApi,
  fetchIssueAgentRunsApi,
  fetchPrCommentsApi,
  isAgentRunWorking,
  isAgentRunActive,
} from "./agent-api";

/** Clé de cache des runs d'agent d'une issue. */
export function issueAgentRunsQueryKey(issueId: string) {
  return ["agent-runs", "issue", issueId] as const;
}

/**
 * Runs de l'agent d'une issue, avec polling adaptatif : ~3 s tant que l'agent
 * TRAVAILLE (queued/running) ; ~12 s de backstop tant qu'une session existe mais est
 * au repos (needs_input) — pour capter une reprise déclenchée par un AUTRE client
 * (autre onglet, coéquipier) même quand notre modal est ouverte ; sinon pas de
 * polling. `refetchOnMount: always` garantit un état frais à l'ouverture de la modal
 * (évite d'ouvrir « compose » sur une session déjà vivante à cause d'un cache périmé).
 */
export function useIssueAgentRunsQuery(issueId: string | null) {
  const { data, isLoading } = useQuery({
    queryKey: issueAgentRunsQueryKey(issueId ?? ""),
    queryFn: () => fetchIssueAgentRunsApi(issueId as string),
    enabled: !!issueId,
    refetchOnMount: "always",
    refetchInterval: (query) => {
      const runs = query.state.data?.runs ?? [];
      if (runs.some((r) => isAgentRunWorking(r.status))) return 3000;
      if (runs.some((r) => isAgentRunActive(r.status))) return 12000;
      return false;
    },
  });
  return { runs: data?.runs ?? [], loading: isLoading };
}

/**
 * Events du live view d'un run : polling ~2 s tant que le run est actif.
 * `runId` null = la session n'existe pas encore (POST de lancement en vol) : rien à
 * interroger, le fil n'affiche que la bulle optimiste du 1er message.
 */
export function useAgentRunEventsQuery(runId: string | null, active: boolean) {
  const { data, isLoading } = useQuery({
    queryKey: ["agent-run-events", runId],
    queryFn: () => fetchAgentRunEventsApi(runId as string),
    enabled: !!runId,
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

/** Clé de cache de la liste globale des sessions d'agent (page Agents). */
export const allAgentSessionsQueryKey = ["agent-sessions", "all"] as const;

/**
 * Liste globale des sessions de l'agent (page Agents). Polling ~5 s tant qu'une
 * session TRAVAILLE (Numo tourne), sinon pas de polling — calqué sur
 * `useAllPullRequestsQuery`.
 */
export function useAgentSessionsQuery() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: allAgentSessionsQueryKey,
    queryFn: fetchAgentSessionsApi,
    refetchInterval: (query) => {
      const sessions = query.state.data?.sessions ?? [];
      return sessions.some((s) => s.working) ? 5000 : false;
    },
  });
  return { sessions: data?.sessions ?? [], loading: isLoading, refetch };
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
