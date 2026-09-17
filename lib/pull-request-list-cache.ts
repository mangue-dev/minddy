import type { QueryClient, QueryKey } from "@tanstack/react-query";

import type {
  AgentRunPrResponse,
  PullRequestListItem,
  PullRequestListResponse,
} from "./agent-api";

/**
 * The caches of the Pull Requests page, and the ONE write that keeps them in
 * step with a state change. Pure module, like its cousins
 * `lib/realtime-keys.ts` and `lib/sidebar-deep-link.ts`: the page owns the
 * gesture, this owns the bookkeeping — testable without React.
 */

/** Prefix of every cache variant of the global list (per filter, page, pin). */
export const ALL_PULL_REQUESTS_QUERY_KEY = ["pull-requests", "all"] as const;

/** `open` understands drafts, like the filter served by the API. */
export function matchesStateFilter(
  state: PullRequestListItem["pr_state"],
  filter: unknown,
): boolean {
  return (
    filter === "all" ||
    (filter === "open" && (state === "open" || state === "draft")) ||
    filter === state
  );
}

/**
 * Applies a state change to all cached variants in the list.
 * A line that leaves the current filter disappears immediately: the sidebar and
 * the detail therefore choose their new state in the same rendering. When the
 * line was the LAST of its lens — the default “open”, most often — the list
 * simply empties and the selection falls to zero; the filter itself never
 * moves. Widening the lens to keep a merged PR visible is the READER's
 * gesture (the filter menu), never a side effect of a merge.
 */
export function updateCachedPullRequestState(
  queryClient: Pick<QueryClient, "getQueriesData" | "setQueryData">,
  prId: string,
  state: PullRequestListItem["pr_state"],
): void {
  for (const [key, data] of queryClient.getQueriesData<PullRequestListResponse>({
    queryKey: ALL_PULL_REQUESTS_QUERY_KEY,
  })) {
    if (!data || !data.pullRequests.some((pr) => pr.prId === prId)) continue;
    const filter = (key as QueryKey)[2];
    const pullRequests = matchesStateFilter(state, filter)
      ? data.pullRequests.map((pr) => (pr.prId === prId ? { ...pr, pr_state: state } : pr))
      : data.pullRequests.filter((pr) => pr.prId !== prId);
    queryClient.setQueryData(key, { ...data, pullRequests });
  }

  // The detail has its own cache, served by the forge. Let it wait for its
  // refetch after having already changed the sidebar — two states of the
  // same PR during one network round trip would flash.
  queryClient.setQueryData<AgentRunPrResponse>(["pull-request", prId], (data) => {
    if (!data?.pr) return data;
    return {
      ...data,
      pr: {
        ...data.pr,
        state,
        draft: state === "draft",
        merged: state === "merged",
      },
    };
  });
}
