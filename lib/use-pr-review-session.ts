"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPullRequestAiReviewApi } from "./agent-api";

/**
 * La session de relecture d'une PR par Numo, du point de vue du fil de la PR
 * (MIN-168).
 *
 * Elle ne se DÉROULE plus ici. Avant, la passe avait son propre flux
 * d'événements et son propre topic de direct (`pr-review:{id}`), rejoués dans la
 * carte du fil ; depuis qu'elle est un run d'agent, son déroulé est celui de
 * n'importe quelle session — `agent_run_events`, le topic `agent-run:{id}`, et la
 * conversation de `/agents` qui sait déjà tout rendre. Le fil de la PR n'a plus
 * qu'à dire que l'agent travaille ou qu'il a fini, et à ouvrir la session.
 *
 * D'où ce hook réduit à un poll : il n'y a plus de texte à suivre à la seconde,
 * seulement un statut qui bascule. Le poll ne tourne QUE pendant qu'une session
 * travaille — une session finie ne bouge plus tant que personne ne relance.
 */

const QUERY_KEY = "pr-review-session";

/** Cadence du suivi pendant qu'une session travaille. */
const ACTIVE_POLL_MS = 5000;

export function usePrReviewSession(prId: string, enabled = true) {
  const { data, isPending, refetch } = useQuery({
    queryKey: [QUERY_KEY, prId] as const,
    queryFn: () => fetchPullRequestAiReviewApi(prId),
    enabled,
    refetchInterval: (query) => (query.state.data?.run?.working ? ACTIVE_POLL_MS : false),
  });

  const run = data?.run ?? null;
  return {
    run,
    /** L'agent travaille en ce moment sur cette PR. */
    active: run?.working === true,
    reviewedHeadSha: data?.reviewedHeadSha ?? null,
    model: data?.model ?? null,
    loading: enabled && isPending,
    refetch,
  };
}
