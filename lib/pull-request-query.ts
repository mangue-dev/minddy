import type { QueryClient } from "@tanstack/react-query";
import { ApiError, fetchPullRequestApi } from "./agent-api";
import { pullRequestRefetchInterval } from "./pr-readiness-actions";

/** Retry-After also gates focus, activation and speculative reads. */
export function pullRequestReadRetryAt(state: { error: unknown; errorUpdatedAt: number } | undefined): number {
  if (!(state?.error instanceof ApiError)) return 0;
  if (state.error.retryAt) return state.error.retryAt;
  return [403, 429].includes(state.error.status ?? 0) ? state.errorUpdatedAt + 60_000 : 0;
}

export function pullRequestAccountRetryAt(client: QueryClient): number {
  return client.getQueryCache().findAll({ queryKey: ["pull-request"] })
    .reduce((until, query) => Math.max(until, pullRequestReadRetryAt(query.state)), 0);
}

/** The existing account QueryClient owns both prepared and foreground detail. */
export function pullRequestQueryOptions(prId: string) {
  return {
    queryKey: ["pull-request", prId] as const,
    queryFn: async ({ signal, client }: { signal: AbortSignal; client?: QueryClient }) => {
      if (client && pullRequestAccountRetryAt(client) > Date.now()) {
        const blocked = client.getQueryCache().findAll({ queryKey: ["pull-request"] })
          .find((query) => pullRequestReadRetryAt(query.state) > Date.now());
        throw blocked!.state.error;
      }
      const readStartedAt = Date.now();
      const data = await fetchPullRequestApi(prId, signal);
      return { ...data, readStartedAt };
    },
    staleTime: 0,
    retry: (count: number, error: Error) => {
      if (error instanceof ApiError && (error.retryAt || [401, 403, 404, 429].includes(error.status ?? 0))) return false;
      return count < 2;
    },
    refetchOnMount: "always" as const,
    refetchInterval: (query: { state: { data?: Awaited<ReturnType<typeof fetchPullRequestApi>>; error: unknown; errorUpdatedAt: number } }) =>
      pullRequestReadRetryAt(query.state) > Date.now() ? false : pullRequestRefetchInterval(query.state.data),
  };
}

export type PullRequestReadState = "loading" | "refreshing" | "fresh" | "paused" | "error";

export function pullRequestReadState(
  query: { data?: { readStartedAt?: number }; isPending: boolean; isError: boolean;
    fetchStatus: "idle" | "fetching" | "paused" },
  activatedAt: number,
): PullRequestReadState {
  if (query.fetchStatus === "paused") return "paused";
  if (query.isError) return "error";
  if (query.isPending) return "loading";
  if (query.fetchStatus === "fetching" || (query.data?.readStartedAt ?? 0) < activatedAt) return "refreshing";
  return "fresh";
}
