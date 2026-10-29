"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import type { IssuePr } from "@/lib/agent-api";
import {
  createIssuePrStore,
  type IssuePrPayload,
  type IssuePrReadiness,
  type IssuePrStore,
} from "@/lib/issue-pr-store";
import { usePullRequestReadinessBatchQuery } from "@/lib/use-agent-runs";

/** The readiness endpoint's batch limit. */
const READINESS_BATCH_MAX = 100;
/** Each readiness read costs forge API calls per PR; boards poll every five
    minutes and otherwise follow realtime pull request events. */
const BOARD_READINESS_POLL_MS = 5 * 60_000;

/**
 * One scoped query supplies the pull request chip of every board card. Each card
 * subscribes only to its own issue, so one PR change does not re-render the
 * other cards. Realtime invalidates the query when a pull request changes.
 */
const EMPTY_STORE = createIssuePrStore();
const IssuePrContext = createContext<IssuePrStore>(EMPTY_STORE);

/**
 * The query key. Exported because it is a CONTRACT with the persistence filter
 * (lib/query-provider.tsx) and the realtime invalidation (lib/realtime-keys.ts).
 */
export const issuePrQueryKey = (
  projectId: string | null | undefined,
  projectIds: readonly string[] = [],
) => projectId
  ? (["issue-pull-requests", projectId] as const)
  : (["issue-pull-requests", "__global__", [...projectIds].sort().join(",")] as const);

/**
 * ⚠ A failed request THROWS. Rendering an empty map on `!res.ok` would store the
 * failure as a success and drop every chip until the next refresh; react-query
 * keeps the previous data and retries instead.
 */
export async function fetchIssuePrs(
  projectId: string | null | undefined,
  projectIds: readonly string[] = [],
): Promise<Required<IssuePrPayload>> {
  const url = projectId
    ? `/api/projects/${projectId}/issue-pull-requests`
    : (() => {
        const params = new URLSearchParams();
        for (const id of [...new Set(projectIds)].sort()) params.append("projectId", id);
        const query = params.toString();
        return `/api/issue-pull-requests${query ? `?${query}` : ""}`;
      })();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`issue-pull-requests ${res.status}`);
  const data = (await res.json()) as IssuePrPayload;
  return {
    pullRequests: data.pullRequests ?? {},
    linkedPullRequestIds: data.linkedPullRequestIds ?? {},
  };
}

export function IssuePrProvider({
  projectId,
  projectIds = [],
  children,
}: {
  /** Absent/null → GLOBAL mode (all accessible projects). */
  projectId?: string | null;
  /** Projects currently represented by a global board. */
  projectIds?: readonly string[];
  children: ReactNode;
}) {
  const { data } = useQuery({
    queryKey: issuePrQueryKey(projectId, projectIds),
    queryFn: () => fetchIssuePrs(projectId, projectIds),
  });

  const scope = JSON.stringify(issuePrQueryKey(projectId, projectIds));
  // Replacing a scope must never expose the previous project's pull requests.
  const store = useMemo(() => createIssuePrStore(), [scope]);
  useLayoutEffect(() => store.update(data), [store, data]);

  // Merge readiness of the live PRs on the board, in ONE batch: the same
  // request, polling and realtime invalidation as the Code review page rows.
  const livePrIds = useMemo(
    () => [...new Set(Object.values(data?.pullRequests ?? {})
      // Drafts are not up for merge: their chip already says so.
      .filter((pr) => pr.state === "open")
      .map((pr) => pr.prId))].sort().slice(0, READINESS_BATCH_MAX),
    [data],
  );
  const { readinessByPrId, mergeFlowByPrId, unavailablePrIds, error } = usePullRequestReadinessBatchQuery(livePrIds, { minPollMs: BOARD_READINESS_POLL_MS });
  const unavailableKey = error ? livePrIds.join(",") : [...unavailablePrIds].sort().join(",");
  useLayoutEffect(
    () => store.updateReadiness(readinessByPrId, new Set(unavailableKey ? unavailableKey.split(",") : []), mergeFlowByPrId),
    // `unavailablePrIds` is a fresh Set each render; its sorted key is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, readinessByPrId, unavailableKey, mergeFlowByPrId],
  );

  return (
    <IssuePrContext.Provider value={store}>
      {children}
    </IssuePrContext.Provider>
  );
}

/**
 * The pull request for this ticket, ALL STATES, or null.
 *
 * All states: “See pull request” should lead to a closed PR as well as to an
 * open one. The caller discards `closed` where it makes sense — the card's chip
 * only speaks of what still calls for an action (`isPrWorthShowing`).
 */
export function useIssuePr(issueId: string): IssuePr | null {
  const store = useContext(IssuePrContext);
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(issueId, listener),
    [store, issueId],
  );
  const getSnapshot = useCallback(() => store.get(issueId), [store, issueId]);
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/** Merge readiness of the ticket's live pull request, or null. */
export function useIssuePrReadiness(issueId: string): IssuePrReadiness | null {
  const store = useContext(IssuePrContext);
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(issueId, listener),
    [store, issueId],
  );
  const getSnapshot = useCallback(() => store.getReadiness(issueId), [store, issueId]);
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/** The board's store, read on demand by actions over a selection. */
export function useIssuePrStore(): IssuePrStore {
  return useContext(IssuePrContext);
}
