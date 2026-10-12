import type { QueryClient } from "@tanstack/react-query";
import { fetchPullRequestCommentsApi, fetchPullRequestCommitsApi, fetchPrReviewCommentsApi, prEndpoint } from "./agent-api";
import { applyPendingPrReactions, commentReactionsKey } from "./optimistic/pr-reaction-writes";
import { assertPullRequestReadBudget, pullRequestReadRetry } from "./pull-request-query";
import { PULL_REQUEST_SETTLED_POLL_MS } from "./pr-readiness-actions";

type ReadContext = { client: QueryClient; signal: AbortSignal };

/** Exact foreground keys, transport cancellation and pending reaction overlays. */
export function prCommentsQueryOptions(prId: string | null) {
  return {
    queryKey: ["pr-comments", prId] as const,
    queryFn: async ({ client, signal }: ReadContext) => {
      assertPullRequestReadBudget(client);
      const startedAt = Date.now();
      const data = await fetchPullRequestCommentsApi(prId as string, signal);
      return applyPendingPrReactions(client, ["pr-comments", prId as string], data, startedAt);
    },
    retry: pullRequestReadRetry,
    refetchOnMount: "always" as const,
    refetchInterval: PULL_REQUEST_SETTLED_POLL_MS,
  };
}

export function prCommitsQueryOptions(prId: string | null) {
  return {
    queryKey: ["pr-commits", prId] as const,
    queryFn: ({ client, signal }: ReadContext) => {
      assertPullRequestReadBudget(client);
      return fetchPullRequestCommitsApi(prId as string, signal);
    },
    retry: pullRequestReadRetry,
    refetchOnMount: "always" as const,
    refetchInterval: PULL_REQUEST_SETTLED_POLL_MS,
  };
}

export function prReviewCommentsQueryOptions(endpoint: string | null) {
  return {
    queryKey: ["pr-review-comments", endpoint] as const,
    queryFn: async ({ client, signal }: ReadContext) => {
      assertPullRequestReadBudget(client);
      const startedAt = Date.now();
      const data = await fetchPrReviewCommentsApi(endpoint as string, signal);
      return applyPendingPrReactions(client, commentReactionsKey(endpoint as string, "review"), data, startedAt);
    },
    retry: pullRequestReadRetry,
    refetchOnMount: "always" as const,
  };
}

export function prActivityPreparationQueries(prId: string) {
  return [prCommentsQueryOptions(prId), prCommitsQueryOptions(prId), prReviewCommentsQueryOptions(prEndpoint(prId))];
}
