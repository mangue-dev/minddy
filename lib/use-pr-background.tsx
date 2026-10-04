"use client";

import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useAllPullRequestsQuery } from "./use-agent-runs";
import { pullRequestAccountRetryAt, pullRequestQueryOptions } from "./pull-request-query";
import { usePrLive } from "./use-pr-live";

export const PR_BACKGROUND_LIMIT = 5;

function LiveDetail({ prId }: { prId: string }) {
  usePrLive(prId);
  return null;
}

/** The account shell maintains five recent open PRs while the window is visible. */
export function PrBackgroundSync() {
  const client = useQueryClient();
  const { pullRequests } = useAllPullRequestsQuery();
  const ids = [...new Set(pullRequests
    .filter((pr) => pr.pr_state === "open" || pr.pr_state === "draft")
    .map((pr) => pr.prId))].slice(0, PR_BACKGROUND_LIMIT);
  useQueries({ queries: ids.map((prId) => ({
    ...pullRequestQueryOptions(prId),
    staleTime: 60_000,
    refetchOnMount: true as const,
    refetchInterval: () => {
      const pause = pullRequestAccountRetryAt(client) - Date.now();
      return pause > 0 ? pause : 60_000;
    },
  })) });
  return ids.map((prId) => <LiveDetail key={prId} prId={prId} />);
}
