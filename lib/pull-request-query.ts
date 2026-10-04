import type { QueryClient } from "@tanstack/react-query";
import { ApiError, fetchPullRequestApi } from "./agent-api";
import { pullRequestRefetchInterval } from "./pr-readiness-actions";
import { nextReadActivationSequence, readActivationSession } from "./read-activation-sequence";

/** Retry-After also gates focus, activation and speculative reads. */
export function pullRequestReadRetryAt(state: { error: unknown; errorUpdatedAt: number } | undefined): number {
  if (!(state?.error instanceof ApiError)) return 0;
  if (state.error.retryAt !== undefined) return state.error.retryAt;
  if (![403, 429].includes(state.error.status ?? 0)) return 0;
  // Propagating the same account error to another query must not restart its
  // fallback pause and indefinitely prevent recovery without Retry-After.
  state.error.retryAt = state.errorUpdatedAt + 60_000;
  return state.error.retryAt;
}

const PR_READ_KEYS = new Set(["pull-request", "pull-request-readiness", "pull-requests", "pr-comments", "pr-commits", "pr-commit-diff", "pr-review-comments"]);
const isPullRequestReadKey = (key: readonly unknown[]) => PR_READ_KEYS.has(String(key[0]));

export function assertPullRequestReadBudget(client: QueryClient): void {
  const blocked = client.getQueryCache().findAll().find((query) =>
    isPullRequestReadKey(query.queryKey) && pullRequestReadRetryAt(query.state) > Date.now());
  if (blocked) throw blocked.state.error;
}

export function pullRequestReadRetry(count: number, error: Error): boolean {
  if (error instanceof ApiError && (error.retryAt || [401, 403, 404, 429].includes(error.status ?? 0))) return false;
  return count < 2;
}

export function pullRequestAccountRetryAt(client: QueryClient): number {
  return client.getQueryCache().findAll().filter((query) => isPullRequestReadKey(query.queryKey))
    .reduce((until, query) => Math.max(until, pullRequestReadRetryAt(query.state)), 0);
}

/** The existing account QueryClient owns both prepared and foreground detail. */
export function pullRequestQueryOptions(prId: string) {
  return {
    queryKey: ["pull-request", prId] as const,
    queryFn: async ({ signal, client }: { signal: AbortSignal; client?: QueryClient }) => {
      if (client) assertPullRequestReadBudget(client);
      const readSequence = nextReadActivationSequence();
      const data = await fetchPullRequestApi(prId, signal);
      return { ...data, readSequence, readSession: readActivationSession };
    },
    staleTime: 0,
    retry: pullRequestReadRetry,
    refetchOnMount: "always" as const,
    refetchInterval: (query: { state: { data?: Awaited<ReturnType<typeof fetchPullRequestApi>>; error: unknown; errorUpdatedAt: number } }) => {
      const delay = pullRequestReadRetryAt(query.state) - Date.now();
      return delay > 0 ? delay : pullRequestRefetchInterval(query.state.data);
    },
  };
}

export type PullRequestReadState = "loading" | "refreshing" | "fresh" | "paused" | "error";

export function pullRequestReadPrecedesActivation(
  data: { readSequence?: number; readSession?: string } | undefined,
  activationSequence: number,
): boolean {
  return data?.readSession !== readActivationSession || (data.readSequence ?? 0) < activationSequence;
}

export function pullRequestReadState(
  query: { data?: { readSequence?: number; readSession?: string }; isPending: boolean; isError: boolean;
    fetchStatus: "idle" | "fetching" | "paused" },
  activationSequence: number,
): PullRequestReadState {
  if (query.fetchStatus === "paused") return "paused";
  if (query.isError) return "error";
  if (query.isPending) return "loading";
  if (query.fetchStatus === "fetching" || pullRequestReadPrecedesActivation(query.data, activationSequence)) return "refreshing";
  return "fresh";
}
