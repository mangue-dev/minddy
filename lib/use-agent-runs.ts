"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchAgentRunApi,
  fetchAgentRunDiffApi,
  fetchAgentRunEventsApi,
  fetchAgentSessionsApi,
  fetchAllPullRequestsApi,
  fetchIssueAgentRunsApi,
  fetchPullRequestApi,
  fetchPrCommitDiffApi,
  fetchPullRequestCommentsApi,
  fetchPullRequestCommitsApi,
  fetchPrReviewCommentsApi,
  isAgentRunWorking,
  type PrEndpoint,
  type PullRequestStateFilter,
} from "./agent-api";

/** Clé de cache des runs d'agent d'une issue. */
export function issueAgentRunsQueryKey(issueId: string) {
  return ["agent-runs", "issue", issueId] as const;
}

/**
 * Runs de l'agent d'une issue, avec polling adaptatif : ~3 s tant que l'agent
 * TRAVAILLE (queued/running) ; ~12 s de backstop sinon dès qu'une run existe —
 * pour capter une reprise déclenchée par un AUTRE client (autre onglet,
 * coéquipier) même quand notre conversation est ouverte. `refetchOnMount: always`
 * garantit un état frais à l'ouverture de la modal (évite d'ouvrir « compose » sur
 * une session déjà vivante à cause d'un cache périmé).
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
      if (runs.length > 0) return 12000;
      return false;
    },
  });
  return { runs: data?.runs ?? [], loading: isLoading };
}

/** Clé de cache du détail d'un run (conversation d'une session CARNET, MIN-84). */
export function agentRunQueryKey(runId: string) {
  return ["agent-run", runId] as const;
}

/**
 * Détail d'UN run — la conversation d'une session carnet (le run EST la session,
 * pas de liste de runs d'issue à interroger). Même cadence que les runs d'issue :
 * ~3 s tant que l'agent travaille, ~12 s de backstop sinon (capte une reprise
 * depuis un autre onglet), état frais à chaque montage.
 */
export function useAgentRunQuery(runId: string | null) {
  const { data, isLoading } = useQuery({
    queryKey: agentRunQueryKey(runId ?? ""),
    queryFn: () => fetchAgentRunApi(runId as string),
    enabled: !!runId,
    refetchOnMount: "always",
    refetchInterval: (query) => {
      const run = query.state.data?.run;
      if (run && isAgentRunWorking(run.status)) return 3000;
      return run ? 12000 : false;
    },
  });
  return { run: data?.run ?? null, loading: isLoading };
}

/**
 * Events du live view d'un run : polling ~2 s tant que le run est actif.
 * `runId` null = la session n'existe pas encore (POST de lancement en vol) : rien à
 * interroger, le fil n'affiche que la bulle optimiste du 1er message.
 *
 * `refetchOnMount: always` : au repos le run ne poll plus, et le `staleTime` global
 * de 5 min garderait le cache « frais ». Sans ce forçage, revenir sur la page Agents
 * après avoir quitté l'onglet (remontage du composant) réafficherait les events
 * d'AVANT — sans le dernier message envoyé ni la réponse de l'agent — jusqu'à un
 * rechargement complet. On refetch donc à chaque montage, comme les runs de l'issue.
 */
export function useAgentRunEventsQuery(runId: string | null, active: boolean) {
  const { data, isLoading } = useQuery({
    queryKey: ["agent-run-events", runId],
    queryFn: () => fetchAgentRunEventsApi(runId as string),
    enabled: !!runId,
    refetchOnMount: "always",
    refetchInterval: active ? 2000 : false,
  });
  return { events: data?.events ?? [], loading: isLoading };
}

/** Cadence de suivi d'une CI en cours — une CI se compte en minutes, pas en
    secondes : plus lent que le diff (7 s) qui, lui, suit un agent qui écrit. */
const CHECKS_POLL_MS = 15_000;

/**
 * PR d'un run pour la review in-app : metadata, fichiers/patches, checks CI,
 * approbations et méthodes de merge offertes par la forge (MIN-138).
 *
 * Tant qu'un check est `pending`, on re-poll : sans ça le bandeau CI resterait
 * figé sur « en cours » jusqu'à un rechargement de page, alors que c'est
 * précisément le moment où l'utilisateur regarde.
 */
export function usePullRequestQuery(prId: string, enabled: boolean) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["pull-request", prId],
    queryFn: () => fetchPullRequestApi(prId),
    enabled,
    refetchInterval: (query) =>
      query.state.data?.checks?.state === "pending" ? CHECKS_POLL_MS : false,
  });
  return {
    pr: data?.pr ?? null,
    files: data?.files ?? [],
    checks: data?.checks ?? null,
    checksError: data?.checksError ?? null,
    reviews: data?.reviews ?? null,
    // Qui je suis pour cette PR (MIN-144). `null` tant que le GET n'a pas
    // répondu : l'UI n'offre alors aucun geste d'écriture, plutôt que d'en
    // proposer un qu'elle retirerait une seconde plus tard.
    viewer: data?.viewer ?? null,
    mergeMethods: data?.mergeMethods ?? [],
    loading: isLoading,
    refetch,
  };
}

/** Clé de cache du diff vivant d'un run (vue diff dans la conversation). */
export function agentRunDiffQueryKey(runId: string) {
  return ["agent-run-diff", runId] as const;
}

/**
 * Diff vivant d'un run — la vue diff DANS la conversation, sans attendre la PR.
 * Interrogé seulement quand la vue est OUVERTE (`enabled`) ; tant que l'agent
 * travaille, re-poll ~7 s — le diff n'avance qu'aux pushes de fin de tour,
 * inutile de suivre la cadence 2 s des events. `refetchOnMount: always` : la vue
 * repart toujours d'un état frais à l'ouverture (le staleTime global de 5 min
 * garderait sinon un diff d'avant le dernier tour).
 */
export function useAgentRunDiffQuery(runId: string, enabled: boolean, working: boolean) {
  const { data, isLoading } = useQuery({
    queryKey: agentRunDiffQueryKey(runId),
    queryFn: () => fetchAgentRunDiffApi(runId),
    enabled,
    refetchOnMount: "always",
    refetchInterval: enabled && working ? 7000 : false,
  });
  return {
    files: data?.files ?? [],
    provider: data?.provider,
    url: data?.url ?? null,
    loading: isLoading,
  };
}

/** Page de liste par défaut — le serveur borne à 500 (un dépôt actif a des
    centaines de PR ; les charger toutes n'a jamais servi personne). */
export const PULL_REQUESTS_PAGE = 100;

/** PR à garantir dans la réponse malgré la pagination (deep-link). */
export interface PullRequestPin {
  pr?: string | null;
  run?: string | null;
}

/** Clé de cache de la liste globale des PR (MIN-66) — variable par filtre/page. */
export function allPullRequestsQueryKey(
  state: PullRequestStateFilter = "open",
  limit: number = PULL_REQUESTS_PAGE,
  pin?: PullRequestPin,
) {
  return ["pull-requests", "all", state, limit, pin?.pr ?? null, pin?.run ?? null] as const;
}

/**
 * Liste globale des PR des dépôts liés (page Pull Requests). Polling ~5 s tant
 * qu'une PR a un run actif (Numo retravaille dessus), sinon pas de polling.
 *
 * Le filtre d'ÉTAT est servi par le serveur (MIN-143) : depuis que la liste
 * montre tout le dépôt et plus seulement les PR de Numo, « toutes » veut dire
 * des centaines de lignes, dont personne ne regarde les fermées.
 *
 * `refetchOnMount: always` (même raison que useAgentSessionsQuery) : au repos la
 * liste ne poll plus ET l'app-shell garde ce cache chaud, donc un deep-link
 * `?run=` arrivant sur un cache « frais » (staleTime global 5 min) ne verrait
 * jamais la PR qu'on vient de créer. On expose aussi `fetching` : la page PR
 * attend qu'un refetch en vol atterrisse avant de retomber sur la 1re PR de la
 * liste, sinon le deep-link ouvrirait la dernière PR au lieu de la bonne.
 *
 * `placeholderData` = la page PRÉCÉDENTE. La pagination met `limit` dans la clé
 * de cache : sans ça, « en voir plus » ouvre une clé vierge, donc `isLoading`
 * repasse à vrai — la liste entière retombe en squelettes, le bouton disparaît
 * et le panneau de détail se vide, pour revenir une seconde plus tard. C'est un
 * AGRANDISSEMENT de la liste, pas un changement d'écran : elle reste affichée, et
 * `fetching` (que le bouton lit déjà : spinner + désactivé) porte l'attente.
 */
export function useAllPullRequestsQuery(
  state: PullRequestStateFilter = "open",
  limit: number = PULL_REQUESTS_PAGE,
  pin?: PullRequestPin,
) {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: allPullRequestsQueryKey(state, limit, pin),
    queryFn: () => fetchAllPullRequestsApi({ state, limit, pin }),
    placeholderData: (previous) => previous,
    refetchOnMount: "always",
    refetchInterval: (query) => {
      const prs = query.state.data?.pullRequests ?? [];
      return prs.some((p) => p.activeRunId) ? 5000 : false;
    },
  });
  return {
    pullRequests: data?.pullRequests ?? [],
    hasMore: data?.hasMore ?? false,
    truncated: data?.truncated ?? false,
    loading: isLoading,
    fetching: isFetching,
    refetch,
  };
}

/** Clé de cache de la liste globale des sessions d'agent (page Agents). */
export const allAgentSessionsQueryKey = ["agent-sessions", "all"] as const;

/**
 * Liste globale des sessions de l'agent (page Agents). Polling ~5 s tant qu'une
 * session TRAVAILLE (Numo tourne), sinon pas de polling — calqué sur
 * `useAllPullRequestsQuery`. `refetchOnMount: always` pour la même raison que les
 * events : au repos la liste ne poll plus, donc revenir sur /agents après avoir
 * quitté l'onglet réafficherait des statuts/non-lus périmés (cache « frais » 5 min)
 * jusqu'à un rechargement complet.
 */
export function useAgentSessionsQuery() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: allAgentSessionsQueryKey,
    queryFn: fetchAgentSessionsApi,
    refetchOnMount: "always",
    refetchInterval: (query) => {
      const sessions = query.state.data?.sessions ?? [];
      return sessions.some((s) => s.working) ? 5000 : false;
    },
  });
  return { sessions: data?.sessions ?? [], loading: isLoading, refetch };
}

/** Fil de conversation d'une PR (commentaires GitHub) et leurs réactions. */
export function usePrCommentsQuery(prId: string | null) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["pr-comments", prId],
    queryFn: () => fetchPullRequestCommentsApi(prId as string),
    enabled: !!prId,
  });
  return {
    comments: data?.comments ?? [],
    // Les réactions (MIN-147) voyagent avec les commentaires, comme côté review :
    // elles se rendent SOUS un message, et le corps de la PR y a les siennes.
    reactions: data?.reactions ?? [],
    loading: isLoading,
    refetch,
  };
}

/**
 * Commits d'une PR (onglet Commits). Pas de polling : une liste de commits ne
 * bouge qu'à un push, et l'appelant la rafraîchit quand Numo finit de
 * travailler — c'est le seul moment où elle change sous les yeux du lecteur.
 */
export function usePrCommitsQuery(prId: string | null) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["pr-commits", prId],
    queryFn: () => fetchPullRequestCommitsApi(prId as string),
    enabled: !!prId,
  });
  return {
    commits: data?.commits ?? [],
    truncated: data?.truncated ?? false,
    loading: isLoading,
    refetch,
  };
}

/**
 * Diff d'UN commit de la PR. Interrogé seulement quand la vue est OUVERTE
 * (`enabled`) : c'est un aller-retour de forge par commit regardé, et la
 * plupart ne le sont jamais. Aucun polling — un commit est immuable.
 */
export function usePrCommitDiffQuery(prId: string, sha: string | null) {
  const { data, isLoading } = useQuery({
    queryKey: ["pr-commit-diff", prId, sha],
    queryFn: () => fetchPrCommitDiffApi(prId, sha as string),
    enabled: !!sha,
  });
  return { diff: data ?? null, loading: isLoading };
}

/**
 * Commentaires de review d'une PR (ceux ancrés à une ligne du diff). Prend une
 * BASE de route et non un id : la vue diff sert la page Pull Requests (indexée
 * par PR) comme la conversation d'agent (indexée par run) — cf. `PrEndpoint`.
 */
export function usePrReviewCommentsQuery(endpoint: PrEndpoint | null) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["pr-review-comments", endpoint],
    queryFn: () => fetchPrReviewCommentsApi(endpoint as PrEndpoint),
    enabled: !!endpoint,
  });
  // `threads` (MIN-139) voyage avec les commentaires : c'est la même query, donc
  // le même rafraîchissement — résoudre un fil et répondre dedans ne peuvent pas
  // se désynchroniser.
  return {
    comments: data?.comments ?? [],
    threads: data?.threads ?? [],
    // Les réactions (MIN-139) voyagent avec, pour la même raison : elles se
    // rendent SOUS un commentaire, jamais séparément.
    reactions: data?.reactions ?? [],
    loading: isLoading,
    refetch,
  };
}
