import type { QueryClient } from "@tanstack/react-query";
import { ApiError, fetchPullRequestApi } from "./agent-api";
import { isDefinitiveReadError } from "./backend-availability";
import { pullRequestRefetchInterval } from "./pr-readiness-actions";
import { nextReadActivationSequence, readActivationSession } from "./read-activation-sequence";

type ReadQuotaState = { error: unknown; errorUpdatedAt: number; data?: unknown };
const partialQuotaErrors = new WeakMap<object, ApiError>();
const accountQuotaErrors = new WeakMap<QueryClient, ApiError>();

/**
 * Only a 429, or a 403 carrying Retry-After, is a forge quota. A plain 403
 * (permission, MFA, missing forge authorization) belongs to its own query:
 * sharing it paused every pull request read and kept the pause alive for as
 * long as the forbidden resource was polled (MIN-691).
 */
function isQuotaError(error: ApiError): boolean {
  return error.status === 429 || (error.status === 403 && error.retryAt !== undefined);
}

function stateQuotaError(state: ReadQuotaState | undefined): ApiError | undefined {
  let error = state?.error instanceof ApiError && isQuotaError(state.error) ? state.error : undefined;
  // Propagating the same account error to another query must not restart its
  // fallback pause and indefinitely prevent recovery without Retry-After.
  if (error && error.retryAt === undefined) error.retryAt = state!.errorUpdatedAt + 60_000;
  const data = state?.data;
  if (data && typeof data === "object") {
    const partial = data as { retryStatus?: unknown; retryAt?: unknown };
    if ([403, 429].includes(partial.retryStatus as number) && typeof partial.retryAt === "number" &&
        Number.isFinite(partial.retryAt) && partial.retryAt > (error?.retryAt ?? 0)) {
      let quota = partialQuotaErrors.get(data);
      if (!quota || quota.retryAt !== partial.retryAt || quota.status !== partial.retryStatus) {
        quota = new ApiError("Forge reads are paused", "forgeUnavailable");
        quota.status = partial.retryStatus as number; quota.retryAt = partial.retryAt;
        partialQuotaErrors.set(data, quota);
      }
      error = quota;
    }
  }
  return error;
}

/** Retry-After also gates focus, activation and speculative reads. */
export function pullRequestReadRetryAt(state: ReadQuotaState | undefined): number {
  return stateQuotaError(state)?.retryAt ?? 0;
}

const PR_READ_KEYS = new Set(["pull-request", "pull-request-readiness", "pull-requests", "pr-comments", "pr-commits", "pr-commit-diff", "pr-review-comments"]);
const isPullRequestReadKey = (key: readonly unknown[]) => PR_READ_KEYS.has(String(key[0]));

function accountQuotaError(client: QueryClient): ApiError | undefined {
  let blocked = accountQuotaErrors.get(client);
  for (const query of client.getQueryCache().findAll()) {
    if (!isPullRequestReadKey(query.queryKey)) continue;
    const error = stateQuotaError(query.state);
    if (error && (error.retryAt ?? 0) > (blocked?.retryAt ?? 0)) blocked = error;
  }
  // A refetch clears its own query error before its queryFn runs. Keep the
  // already-observed account deadline outside that transient fetch state.
  if (blocked && (blocked.retryAt ?? 0) > Date.now()) {
    accountQuotaErrors.set(client, blocked); return blocked;
  }
  accountQuotaErrors.delete(client);
  return undefined;
}

export function assertPullRequestReadBudget(client: QueryClient): void {
  const blocked = accountQuotaError(client);
  if (blocked) throw blocked;
}

export function pullRequestReadRetry(count: number, error: Error): boolean {
  if (error instanceof ApiError && (error.retryAt || [401, 403, 404, 429].includes(error.status ?? 0))) return false;
  return count < 2;
}

export function pullRequestAccountRetryAt(client: QueryClient): number {
  return accountQuotaError(client)?.retryAt ?? 0;
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
  if (pullRequestReadPrecedesActivation(query.data, activationSequence)) return "refreshing";
  return "fresh";
}

/**
 * What the detail screen shows. Loaded data from this page session stays on
 * screen through routine polling, temporary failures and quota pauses, since a
 * pull request is polled continuously and any blip used to replace it with an
 * error (MIN-691). Withdrawn access or a missing pull request still conceal it.
 * Writes keep following `pullRequestReadState`.
 */
export function pullRequestDisplayReadState(
  query: Parameters<typeof pullRequestReadState>[0] & { error: unknown },
  activationSequence: number,
): PullRequestReadState {
  const keepsContent = !query.isError ||
    (query.error instanceof ApiError && isQuotaError(query.error)) || !isDefinitiveReadError(query.error);
  return keepsContent && query.fetchStatus !== "paused" && query.data?.readSession === readActivationSession
    ? "fresh" : pullRequestReadState(query, activationSequence);
}
