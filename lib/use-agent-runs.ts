"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import {
  fetchAgentRunApi,
  fetchAgentRunDiffApi,
  fetchAgentRunEventsApi,
  fetchAgentSessionsApi,
  fetchAllPullRequestsApi,
  fetchIssueAgentRunsApi,
  fetchIssueAutomationApi,
  fetchOpenPullRequestCountApi,
  fetchPullRequestApi,
  fetchPrCommitDiffApi,
  fetchPullRequestCommentsApi,
  fetchPullRequestCommitsApi,
  fetchPrReviewCommentsApi,
  isAgentRunWorking,
  type AgentSessionListItem,
  type PrEndpoint,
  type PullRequestStateFilter,
} from "./agent-api";

/** Cache key for agent runs of an issue. */
export function issueAgentRunsQueryKey(issueId: string) {
  return ["agent-runs", "issue", issueId] as const;
}

/**
 * Runs of the agent of an issue, with adaptive polling: ~3 s as long as the agent
 * WORK (queued/running); ~12 s backstop otherwise as soon as a run exists —
 * to capture a recovery triggered by ANOTHER client (other tab,
 * teammate) even when our conversation is open. `refetchOnMount: always`
 * guarantees a fresh state when opening the modal (avoids opening “compose” on
 * a session already alive because of an expired cache).
 */
export function useIssueAgentRunsQuery(issueId: string | null) {
  const enabled = !!issueId;
  const { data, isPending } = useQuery({
    queryKey: issueAgentRunsQueryKey(issueId ?? ""),
    queryFn: () => fetchIssueAgentRunsApi(issueId as string),
    enabled,
    refetchOnMount: "always",
    refetchInterval: (query) => {
      const runs = query.state.data?.runs ?? [];
      if (runs.some((r) => isAgentRunWorking(r.status))) return 3000;
      if (runs.length > 0) return 12000;
      return false;
    },
  });
  return {
    runs: data?.runs ?? [],
    /** The PR of the ticket, regardless of its state — null if it has none. */
    pullRequest: data?.pullRequest ?? null,
    loading: enabled && isPending,
  };
}

/** Ticket automation chain cache key (MIN-147). */
export function issueChainQueryKey(issueId: string) {
  return ["agent-chain", "issue", issueId] as const;
}

/**
 * Ticket automation chain. NO polling, unlike its
 * neighbors: a channel lives for several minutes without anyone touching it
 * nothing, and that's exactly why it has a dedicated realtime trigger
 * (`case "agent_chains"` in lib/realtime-provider.tsx) — direct does it
 * move, a timer would just pay requests for nothing.
 *
 * `refetchOnMount: always` anyway: realtime does not replay what happened
 * passed while the tab was sleeping.
 */
export function useIssueChainQuery(issueId: string | null) {
  const on = !!issueId;
  const { data, isPending } = useQuery({
    queryKey: issueChainQueryKey(issueId ?? ""),
    queryFn: () => fetchIssueAutomationApi(issueId as string),
    enabled: on,
    refetchOnMount: "always",
  });
  return {
    enabled: data?.enabled ?? false,
    chain: data?.chain ?? null,
    plannedModes: data?.plannedModes ?? [],
    estimate: data?.estimate ?? null,
    loading: on && isPending,
  };
}

/** Cache key for the details of a run (conversation of a NOTEBOOK session, MIN-84). */
export function agentRunQueryKey(runId: string) {
  return ["agent-run", runId] as const;
}

/**
 * Details of ONE run — the conversation of a notebook session (the run IS the session,
 * no list of outcome runs to query). Same cadence as the outcome runs:
 * ~3 s as long as the agent is working, ~12 s backstop otherwise (captures a restart
 * from another tab), fresh state each time it is edited.
 */
export function useAgentRunQuery(runId: string | null) {
  const enabled = !!runId;
  const { data, isPending } = useQuery({
    queryKey: agentRunQueryKey(runId ?? ""),
    queryFn: () => fetchAgentRunApi(runId as string),
    enabled,
    refetchOnMount: "always",
    refetchInterval: (query) => {
      const run = query.state.data?.run;
      if (run && isAgentRunWorking(run.status)) return 3000;
      return run ? 12000 : false;
    },
  });
  return { run: data?.run ?? null, loading: enabled && isPending };
}

/**
 * Live view events of a run: polling ~2 s as long as the run is active.
 * `runId` null = the session does not yet exist (in-flight launch POST): nothing to
 * query, the thread only displays the optimistic bubble of the 1st message.
 *
 * `refetchOnMount: always`: at rest the run no longer pollutes, and the global `staleTime`
 * of 5 min would keep the cache “fresh”. Without this forcing, return to the Agents page
 * after leaving the tab (remounting the component) would redisplay the events
 * BEFORE — without the last message sent or the agent's response — until a
 * complete reloading. We therefore refetch at each edit, like the runs of the outcome.
 */
export function useAgentRunEventsQuery(runId: string | null, active: boolean) {
  const enabled = !!runId;
  const { data, isPending, isFetching } = useQuery({
    queryKey: ["agent-run-events", runId],
    queryFn: () => fetchAgentRunEventsApi(runId as string),
    enabled,
    refetchOnMount: "always",
    refetchInterval: active ? 2000 : false,
  });
  return {
    events: data?.events ?? [],
    loading: enabled && isPending,
    fetching: enabled && isFetching,
  };
}

/** Tracking rate of a CI in progress — a CI is counted in minutes, not in
    seconds: slower than the diff (7 s) which follows an agent who writes. */
const CHECKS_POLL_MS = 15_000;

/**
 * PR of a run for the in-app review: metadata, files/patches, CI checks,
 * approvals and merge methods offered by the forge (MIN-138).
 *
 * As long as a check is `pending`, we re-poll: otherwise the CI banner would remain
 * frozen on “in progress” until a page reload, even though it is
 * precisely when the user is looking.
 */
export function usePullRequestQuery(prId: string, enabled: boolean) {
  const { data, isPending, refetch } = useQuery({
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
    // Who I am for this PR (MIN-144). `null` as long as the GET has not
    // answered: the UI then does not offer any writing gesture, rather than
    // propose one that she would withdraw a second later.
    viewer: data?.viewer ?? null,
    mergeMethods: data?.mergeMethods ?? [],
    loading: enabled && isPending,
    refetch,
  };
}

/** Cache key for the live diff of a run (diff view in the conversation). */
export function agentRunDiffQueryKey(runId: string) {
  return ["agent-run-diff", runId] as const;
}

/**
 * Diff alive from a run — the diff view IN the conversation, without waiting for the PR.
 * Queried only when the view is OPEN (`enabled`); as long as the agent
 * works, re-poll ~7 sec. `refetchOnMount: always`: the view always restarts
 * from a fresh state upon opening (the overall staleTime of 5 min would otherwise keep a
 * diff before the last round).
 *
 * The 7 s cadence dates from the time when this diff only moved at the end of the push.
 * round. He now comes from the sandbox during the turn and therefore advances in
 * continuous ; 7 s remains the right step — each pass is an RPC round trip in the
 * microVM, and a diff view that repaints itself four times per second does not read.
 */
export function useAgentRunDiffQuery(runId: string, enabled: boolean, working: boolean) {
  const { data, isPending } = useQuery({
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
    live: data?.live === true,
    loading: enabled && isPending,
  };
}

/** Diff SUMMARY cache key (the same files, without the patches). */
export function agentRunDiffStatQueryKey(runId: string) {
  return ["agent-run-diff-stat", runId] as const;
}

/**
 * Header summary from the same diff source as the full session patch.
 *
 * It loads once whenever a conversation is displayed, then polls only while the
 * agent works. Loading at rest lets an authoritative empty response clear stale
 * historical events instead of resurrecting reverted files.
 */
export function useAgentRunDiffStatQuery(
  runId: string | null,
  enabled: boolean,
  working: boolean,
) {
  const { data, isFetching, isError } = useQuery({
    queryKey: agentRunDiffStatQueryKey(runId ?? ""),
    queryFn: () => fetchAgentRunDiffApi(runId!, { stat: true }),
    enabled: Boolean(runId) && enabled,
    refetchOnMount: "always",
    refetchInterval: enabled && working ? 7000 : false,
  });
  return {
    files: data?.files ?? [],
    live: data?.live === true,
    /** Distinguishes an authoritative empty diff from a query that has not answered yet. */
    ready: data !== undefined,
    /** Safe to use for actions: the latest refresh completed successfully. */
    verified: data !== undefined && !isFetching && !isError,
  };
}

/** Default list page — the server limits to 500 (an active repository has
    hundreds of PRs; loading them all never helped anyone). */
export const PULL_REQUESTS_PAGE = 100;

/** PR to be guaranteed in the response despite pagination (deep-link). */
export interface PullRequestPin {
  pr?: string | null;
  run?: string | null;
}

/** Global PR List Cache Key (MIN-66) — variable per filter/page. */
export function allPullRequestsQueryKey(
  state: PullRequestStateFilter = "open",
  limit: number = PULL_REQUESTS_PAGE,
  pin?: PullRequestPin,
) {
  return ["pull-requests", "all", state, limit, pin?.pr ?? null, pin?.run ?? null] as const;
}

/**
 * Global list of PRs of linked repositories (Pull Requests page). Polling ~5 seconds
 * that a PR has an active run (Numo is reworking on it), otherwise no polling.
 *
 * The STATUS filter is served by the server (MIN-143): since the list
 * shows the entire repository and not just the Numo PRs, “all” means
 * hundreds of lines, of which no one looks at the closed ones.
 *
 * `refetchOnMount: always` (same reason as useAgentSessionsQuery): at rest the
 * list no longer polls AND the app-shell keeps this cache hot, therefore a deep-link
 * `?run=` arriving on a “fresh” cache (global staleTime 5 min) would not see
 * never the PR that we have just created. We also expose `fetching`: the PR page
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
  const { data, isPending, isFetching, refetch } = useQuery({
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
    repoCount: data?.repoCount ?? 0,
    anyPr: data?.anyPr ?? false,
    loading: isPending,
    fetching: isFetching,
    refetch,
  };
}

/** Cache key for the global list of agent sessions (Agents page). */
export const allAgentSessionsQueryKey = ["agent-sessions", "all"] as const;

type AgentSessionsData = { sessions: AgentSessionListItem[] };

/** Update one conversation's pinned state in the shared sessions cache.
 * The Agents list derives both its pinned group and its project groups from
 * this query, so one synchronous cache write moves the row immediately. The
 * previous field value is returned for a targeted rollback if the PATCH fails. */
export function patchAgentConversationPinnedInCache(
  queryClient: QueryClient,
  runId: string,
  pinned: boolean,
): boolean | undefined {
  const previous = queryClient.getQueryData<AgentSessionsData>(
    allAgentSessionsQueryKey,
  );
  const session = previous?.sessions.find((item) => item.runId === runId);
  if (!previous || !session) return undefined;

  queryClient.setQueryData<AgentSessionsData>(allAgentSessionsQueryKey, {
    ...previous,
    sessions: previous.sessions.map((item) =>
      item.runId === runId ? { ...item, pinned } : item,
    ),
  });
  return session.pinned;
}

/** Lightweight cache key for the persistent navigation badge. */
export const openPullRequestCountQueryKey = ["pull-requests", "open-count"] as const;

export function useOpenPullRequestCountQuery() {
  const { data } = useQuery({
    queryKey: openPullRequestCountQueryKey,
    queryFn: fetchOpenPullRequestCountApi,
  });
  return data?.count ?? 0;
}

/**
 * Global list of agent sessions (Agents page). Polling ~5 sec as a
 * WORK session (Numo is running), otherwise no polling — modeled on
 * `useAllPullRequestsQuery`. `refetchOnMount: always` for the same reason as the
 * events: at rest the list no longer polls, so return to /agents after having
 * left the tab would redisplay outdated/unread statuses (“fresh” cache 5 min)
 * until fully recharged.
 */
export function useAgentSessionsQuery() {
  const { data, isPending, refetch } = useQuery({
    queryKey: allAgentSessionsQueryKey,
    queryFn: fetchAgentSessionsApi,
    refetchOnMount: "always",
    refetchInterval: (query) => {
      const sessions = query.state.data?.sessions ?? [];
      return sessions.some((s) => s.working) ? 5000 : false;
    },
  });
  return { sessions: data?.sessions ?? [], loading: isPending, refetch };
}

/** PR conversation thread (GitHub comments) and their reactions. */
export function usePrCommentsQuery(prId: string | null) {
  const enabled = !!prId;
  const { data, isPending, refetch } = useQuery({
    queryKey: ["pr-comments", prId],
    queryFn: () => fetchPullRequestCommentsApi(prId as string),
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
 * Commits of a PR (Commitments tab). No polling: a list of commits does not
 * moves only at a push, and the caller refreshes it when Numo finishes
 * work — this is the only moment when it changes before the reader's eyes.
 */
export function usePrCommitsQuery(prId: string | null) {
  const enabled = !!prId;
  const { data, isPending, refetch } = useQuery({
    queryKey: ["pr-commits", prId],
    queryFn: () => fetchPullRequestCommitsApi(prId as string),
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
    queryFn: () => fetchPrCommitDiffApi(prId, sha as string),
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
    queryKey: ["pr-review-comments", endpoint],
    queryFn: () => fetchPrReviewCommentsApi(endpoint as PrEndpoint),
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
