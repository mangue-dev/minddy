"use client";

import { COMPLETED_PULL_REQUESTS_PAGE } from "./pull-request-sections";
import { useAppTabActive, useAppTabActivation } from "./app-tab-route-context";
import { cachedPullRequestListForPin } from "./pull-request-list-cache";
import { prCommentsQueryOptions, prCommitsQueryOptions, prReviewCommentsQueryOptions } from "./pr-activity-query";

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { assertPullRequestReadBudget, pullRequestAccountRetryAt, pullRequestReadRetryAt, pullRequestReadRetry, pullRequestQueryOptions, pullRequestReadState, pullRequestDisplayReadState, pullRequestReadPrecedesActivation } from "./pull-request-query";
import { nextReadActivationSequence } from "./read-activation-sequence";
import {
  fetchAllPullRequestsApi,
  fetchIssuePullRequestApi,
  fetchOpenPullRequestCountApi,
  fetchPullRequestReadinessBatchApi,
  fetchPrCommitDiffApi,
  type PrEndpoint,
  type PullRequestStateFilter,
} from "./agent-api";
import { refetchOnRevealWhenStale } from "./reveal-freshness";
import {
  PULL_REQUEST_SETTLED_POLL_MS,
  pullRequestReadinessBatchRefetchInterval,
} from "./pr-readiness-actions";

/** Cache key for the pull request of an issue (side panel). */
export function issuePullRequestQueryKey(issueId: string) {
  return ["issue-pull-request", issueId] as const;
}

/**
 * The pull request of an issue, in every state, for the side panel — which also
 * opens where the board's PR provider does not exist (Pull requests page,
 * feedback board). Realtime invalidates this key on every `pull_requests`
 * write, so no polling.
 */
export function useIssuePullRequestQuery(issueId: string | null) {
  const { data } = useQuery({
    queryKey: issuePullRequestQueryKey(issueId ?? ""),
    queryFn: () => fetchIssuePullRequestApi(issueId as string),
    enabled: !!issueId,
    refetchOnMount: refetchOnRevealWhenStale,
  });
  return data?.pullRequest ?? null;
}

/**
 * PR of a run for the in-app review: metadata, files/patches, CI checks,
 * approvals and merge methods offered by the forge (MIN-138).
 *
 * As long as a check is `pending`, we re-poll: otherwise the CI banner would remain
 * frozen on “in progress” until a page reload, even though it is
 * precisely when the user is looking.
 */
export function usePullRequestQuery(prId: string, enabled: boolean) {
  const active = useAppTabActive();
  const scopeActivation = useAppTabActivation();
  enabled = enabled && active;
  const activation = useRef<{ prId: string; enabled: boolean; sequence: number } | null>(null);
  if (!activation.current || activation.current.prId !== prId || activation.current.enabled !== enabled || scopeActivation > activation.current.sequence) {
    activation.current = { prId, enabled, sequence: nextReadActivationSequence() };
  }
  const query = useQuery({
    ...pullRequestQueryOptions(prId),
    enabled,
  });
  const { data, isPending, refetch, dataUpdatedAt } = query;
  const activationSequence = activation.current.sequence;
  // An in-flight hover read may finish after activation but have started before
  // a near-click remote change. Join it for display, then validate authoritatively.
  useEffect(() => {
    if (enabled && data && pullRequestReadPrecedesActivation(data, activationSequence) &&
        query.fetchStatus === "idle" && !query.isError) void refetch();
  }, [enabled, data, activationSequence, query.fetchStatus, query.isError, refetch]);
  return {
    pr: data?.pr ?? null,
    /** When the forge GET powering `pr` was RECEIVED — what orders it against
        the panel's own writes (see `pullRequestStateToPropagate` callers). */
    prFetchedAt: dataUpdatedAt,
    files: data?.files ?? [],
    checks: data?.checks ?? null,
    checksError: data?.checksError ?? null,
    deploymentUrl: data?.deploymentUrl ?? null,
    deploymentStatus: data?.deploymentStatus ?? null,
    deploymentStartedAt: data?.deploymentStartedAt ?? null,
    deploymentDurationMs: data?.deploymentDurationMs ?? null,
    reviews: data?.reviews ?? null,
    // Who I am for this PR (MIN-144). `null` as long as the GET has not
    // answered: the UI then does not offer any writing gesture, rather than
    // propose one that she would withdraw a second later.
    viewer: data?.viewer ?? null,
    mergeMethods: data?.mergeMethods ?? [],
    mergePolicy: data?.mergePolicy ?? null,
    readiness: data?.readiness ?? null,
    readinessThreads: data?.reviewThreads ?? null,
    loading: enabled && isPending,
    readState: pullRequestReadState(query, activationSequence),
    // Loaded session data stays visible during revalidation; writes still use readState.
    displayReadState: pullRequestDisplayReadState(query, activationSequence),
    /** Why the last read failed, for the error screen's explanation. */
    readError: query.error,
    refetch,
  };
}

export function usePullRequestReadinessBatchQuery(
  prIds: readonly string[],
  /** Lower bound on polling: boards read readiness as a hint and rely on
      realtime invalidation, so they poll far less than the Code review page. */
  options: { minPollMs?: number } = {},
) {
  const client = useQueryClient();
  const sortedPrIds = [...new Set(prIds)].sort();
  const enabled = sortedPrIds.length > 0;
  const { data, isPending, isError } = useQuery({
    queryKey: ["pull-request-readiness", "batch", sortedPrIds],
    queryFn: ({ client }) => { assertPullRequestReadBudget(client); return fetchPullRequestReadinessBatchApi(sortedPrIds); },
    retry: pullRequestReadRetry,
    enabled,
    refetchOnMount: "always",
    refetchInterval: (query) => {
      const delay = Math.max(pullRequestReadRetryAt(query.state), pullRequestAccountRetryAt(client)) - Date.now();
      const poll = delay > 0 ? delay : pullRequestReadinessBatchRefetchInterval(
        query.state.data,
        query.state.status === "error",
      );
      return typeof poll === "number" ? Math.max(poll, options.minPollMs ?? 0) : poll;
    },
  });
  return {
    readinessByPrId: data?.readiness ?? {},
    unavailablePrIds: new Set(data?.unavailablePrIds ?? []),
    loading: enabled && isPending,
    error: enabled && isError,
  };
}

/** Default list page — the server limits to 500 (an active repository has
    hundreds of PRs; loading them all never helped anyone). */
export const PULL_REQUESTS_PAGE = 100;

/** PR to be guaranteed in the response despite pagination (deep-link). */
export interface PullRequestPin {
  pr?: string | null;
}

/** Global PR List Cache Key (MIN-66) — variable per filter/page. */
export function allPullRequestsQueryKey(
  state: PullRequestStateFilter = "open",
  limit: number = PULL_REQUESTS_PAGE,
  pin?: PullRequestPin,
) {
  return ["pull-requests", "all", state, limit, pin?.pr ?? null] as const;
}

/**
 * Shared authorized list read for foreground observers and idle preparation.
 *
 * Not gated by the account's forge quota (MIN-729): the list is a database
 * read, and the server bounds the sweeps it starts with the repository sync
 * stamp, like the badge count. Gating it froze the list for a whole Retry-After
 * window while the badge kept counting the new PR, so the PR never reached the
 * shell's background cohort either.
 */
export function allPullRequestsQueryOptions(state: PullRequestStateFilter = "open", limit = PULL_REQUESTS_PAGE, pin?: PullRequestPin) {
  return {
    queryKey: allPullRequestsQueryKey(state, limit, pin),
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchAllPullRequestsApi({ state, limit, pin }, signal),
    retry: pullRequestReadRetry,
  };
}

/**
 * Global list of PRs of linked repositories (Pull Requests page). A light
 * one-minute backstop (MIN-595): the list endpoint triggers the out-of-band
 * sweeps of stale repositories, so this backstop is what keeps the list — and,
 * through the sweep, the badge — converging without the user reloading. One
 * request a minute per open page, and the sweep stamp coalesces concurrent
 * callers into one forge read per TTL window.
 *
 * The STATUS filter is served by the server (MIN-143): since the list
 * shows the entire repository and not just the Numo PRs, “all” means
 * hundreds of lines, of which no one looks at the closed ones.
 *
 * `refetchOnMount: always`: the app-shell keeps this cache hot, therefore a
 * deep-link `?pr=` arriving on a “fresh” cache (global staleTime 5 min) would
 * never see the PR that was just created. We also expose `fetching`: the PR page
 * waits for an in-flight refetch to land before falling back to the 1st PR of the
 * list, otherwise the deep-link would open the last PR instead of the correct one.
 *
 * `placeholderData` = PREVIOUS page. Paging puts `limit` in the key
 * cache: without that, “see more” opens a blank key, so `isPending`
 * returns to true — the entire list reverts to skeletons, the button disappears
 * and the detail panel clears, only to return a second later. It's a
 * ENLARGEMENT of the list, not a screen change: it remains displayed, and
 * `fetching` (which the button already reads: spinner + disabled) carries the wait.
 */
export function useAllPullRequestsQuery(
  state: PullRequestStateFilter = "open",
  limit: number = PULL_REQUESTS_PAGE,
  pin?: PullRequestPin,
) {
  const client = useQueryClient();
  const settledPage = useRef({ state, limit });
  const { data, isPending, isError, error, isFetching, isPlaceholderData, refetch } = useQuery({
    ...allPullRequestsQueryOptions(state, limit, pin),
    placeholderData: (previous) => previous ?? cachedPullRequestListForPin(client, state, limit, pin),
    refetchOnMount: "always",
    refetchInterval: PULL_REQUEST_SETTLED_POLL_MS,
  });
  if (!isPending && !isPlaceholderData) settledPage.current = { state, limit };
  return {
    pullRequests: data?.pullRequests ?? [],
    hasMore: data?.hasMore ?? false,
    truncated: data?.truncated ?? false,
    loadingMore: isFetching && isPlaceholderData && state === settledPage.current.state && limit > settledPage.current.limit,
    repoCount: data?.repoCount ?? 0,
    anyPr: data?.anyPr ?? false,
    /** A failed read with nothing to show: not the same as "no linked repository". */
    readFailed: isError && !data,
    readError: error,
    loading: isPending,
    fetching: isFetching,
    refetch,
  };
}

/** Completed PRs have their own offset and never replace the active queues. */
export function useCompletedPullRequestsQuery(enabled: boolean) {
  const query = useInfiniteQuery({
    queryKey: ["pull-requests", "all", "completed", COMPLETED_PULL_REQUESTS_PAGE],
    initialPageParam: 0,
    // A database read like the open list: a forge pause must not freeze it.
    queryFn: ({ pageParam }) => fetchAllPullRequestsApi({ state: "completed", limit: COMPLETED_PULL_REQUESTS_PAGE, offset: pageParam }),
    getNextPageParam: (lastPage, _pages, lastOffset) => lastPage.hasMore ? lastOffset + COMPLETED_PULL_REQUESTS_PAGE : undefined,
    enabled,
    retry: pullRequestReadRetry,
    refetchOnMount: "always",
    // A refetch rereads EVERY loaded page. Past the first one the reader is
    // browsing history, which a sweep rarely changes: the realtime bridge
    // still invalidates the list on each write, the minute backstop stops
    // (MIN-786) instead of costing one request per page per minute.
    refetchInterval: (query) =>
      (query.state.data?.pages.length ?? 0) > 1 ? false : PULL_REQUEST_SETTLED_POLL_MS,
  });
  const pullRequests = useMemo(() => query.data?.pages.flatMap((page) => page.pullRequests) ?? [], [query.data]);
  return { ...query, pullRequests };
}

/** Lightweight cache key for the persistent navigation badge. */
export const openPullRequestCountQueryKey = ["pull-requests", "open-count"] as const;

/**
 * Badge count of open PRs, read on EVERY page (sidebar + tab strip).
 *
 * Two refresh paths (MIN-595), the same ones as the list:
 * - the realtime bridge invalidates this key on every `pull_requests` write
 *   broadcast on a project topic — a webhook-delivered fact moves the badge
 *   immediately, from any page;
 * - a one-minute backstop for everything that only a sweep can see (lost or
 *   absent webhook). The count is a `head: true` aggregate — light enough to
 *   poll — and its endpoint sweeps stale repositories out of band, so this
 *   timer is what retires the old rule “go to the PR page to sync”.
 */
export function useOpenPullRequestCountQuery() {
  const { data } = useQuery({
    queryKey: openPullRequestCountQueryKey,
    queryFn: fetchOpenPullRequestCountApi,
    refetchOnMount: "always",
    refetchInterval: PULL_REQUEST_SETTLED_POLL_MS,
  });
  return data?.count ?? 0;
}

/**
 * PR conversation thread (GitHub comments) and their reactions.
 *
 * Live-topic invalidation (`usePrLive`) carries webhook-delivered facts; the
 * one-minute backstop (MIN-595) is the net for everything else — a timeline
 * entry that only a sweep caught, a delivery that never arrived. Light: one
 * request a minute, per open panel.
 */
export function usePrCommentsQuery(prId: string | null) {
  const enabled = !!prId;
  const { data, isPending, refetch } = useQuery({
    ...prCommentsQueryOptions(prId),
    enabled,
  });
  return {
    comments: data?.comments ?? [],
    // The activity (MIN-159) travels with the messages: it is the SAME thread, ordered
    // by date — serving it separately would cause it to be a time late.
    timeline: data?.timeline ?? [],
    // The reactions (MIN-147) travel with the comments, as on the review side:
    // they go UNDER a message, and the PR body has its own there.
    reactions: data?.reactions ?? [],
    loading: enabled && isPending,
    refetch,
  };
}

/**
 * Commits of a PR (Commitments tab). Same refresh contract as the
 * conversation (MIN-595): the `commits` part of the live topic covers the
 * normal path (a push, Numo's push, a webhook), and the slow backstop below
 * catches what no webhook announced — the list is cheap, the reader is
 * looking, and a push that lands is one request a minute away.
 */
export function usePrCommitsQuery(prId: string | null) {
  const enabled = !!prId;
  const { data, isPending, refetch } = useQuery({
    ...prCommitsQueryOptions(prId),
    enabled,
  });
  return {
    commits: data?.commits ?? [],
    truncated: data?.truncated ?? false,
    loading: enabled && isPending,
    refetch,
  };
}

/**
 * Diff of ONE PR commit. Queried only when view is OPEN
 * (`enabled`): it's a forge round trip per commit looked at, and the
 * most never are. No polling — a commit is immutable.
 */
export function usePrCommitDiffQuery(prId: string, sha: string | null) {
  const enabled = !!sha;
  const { data, isPending } = useQuery({
    queryKey: ["pr-commit-diff", prId, sha],
    queryFn: ({ client }) => { assertPullRequestReadBudget(client); return fetchPrCommitDiffApi(prId, sha as string); },
    retry: pullRequestReadRetry,
    enabled,
  });
  return { diff: data ?? null, loading: enabled && isPending };
}

/**
 * PR review comments (those anchored to a line in the diff). Take a
 * BASE route and not an id: the diff view serves the Pull Requests page (indexed
 * by PR) like the agent conversation (indexed by run) — cf. `PrEndpoint`.
 */
export function usePrReviewCommentsQuery(endpoint: PrEndpoint | null) {
  const enabled = !!endpoint;
  const { data, isPending, refetch } = useQuery({
    ...prReviewCommentsQueryOptions(endpoint),
    enabled,
  });
  // `threads` (MIN-139) travels with the comments: it's the same query, so
  // the same refresh — resolving a thread and replying in it cannot
  // get out of sync.
  return {
    comments: data?.comments ?? [],
    threads: data?.threads ?? [],
    // The reactions (MIN-139) travel with it, for the same reason: they
    // submit UNDER a comment, never separately.
    reactions: data?.reactions ?? [],
    loading: enabled && isPending,
    refetch,
  };
}
