"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPullRequestAiReviewApi } from "./agent-api";

/**
 * Numo's PR review session, from the perspective of the PR thread
 * (MIN-168).
 *
 * It no longer takes place here. Before, the pass had its own stream of events and its own live topic (`pr-review:{id}`), replayed in the thread map; since it is an agent run, its progress is that of
 * any session — `agent_run_events`, the topic `agent-run:{id}`, and the
 * conversation of `/agents` which already knows how to return everything. The PR thread now only has to say that the agent is working or that it has finished, and to open the session.
 *
 * Hence this hook is reduced to a poll: there is no longer any text to follow per second,
 * only a status that switches. The poll ONLY runs while a session
 * is working — a finished session doesn't move until someone restarts.
 */

const QUERY_KEY = "pr-review-session";

/** Tracking cadence while a session is working. */
const ACTIVE_POLL_MS = 5000;
/**
 * How long a just-launched review keeps the poll alive without a run. The
 * launch is a Numo INTENT: the conversation turn starts first, and the agent
 * run row only appears once Numo delegates the work — seconds later. Without
 * this window the poll stops on the first `run: null` answer and the card
 * never learns that a review is in progress.
 */
const LAUNCH_GRACE_MS = 120_000;

export function usePrReviewSession(
  prId: string,
  enabled = true,
  launchedAt: number | null = null,
) {
  const { data, isPending, refetch } = useQuery({
    queryKey: [QUERY_KEY, prId] as const,
    queryFn: () => fetchPullRequestAiReviewApi(prId),
    enabled,
    refetchInterval: (query) => {
      if (query.state.data?.run?.working) return ACTIVE_POLL_MS;
      // Grace after a launch: no run yet does not mean "nothing will come".
      if (launchedAt != null && Date.now() - launchedAt < LAUNCH_GRACE_MS) {
        return ACTIVE_POLL_MS;
      }
      return false;
    },
  });

  const run = data?.run ?? null;
  return {
    run,
    /** The agent is currently working on this PR. */
    active: run?.working === true,
    reviewedHeadSha: data?.reviewedHeadSha ?? null,
    loading: enabled && isPending,
    refetch,
  };
}
