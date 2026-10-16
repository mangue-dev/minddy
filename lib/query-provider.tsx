"use client";

import { QueryClient, QueryClientProvider, type Query } from "@tanstack/react-query";
import { persistQueryClientRestore, type PersistedClient } from "@tanstack/react-query-persist-client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createQueryStorage, subscribeToQueryPersistence } from "./query-persistence";
import { invalidateLocalSnapshotWrites } from "./local-snapshots";
import { configurePayloadRetention, isMemoryOnlyPayload } from "./query-retention";
import { observePageReadFailures } from "./page-read-receipts";
import { retryTemporaryReadFailure } from "./backend-availability";
import { navigationWorkingSetQueryHashes } from "./navigation-working-set";

/**
 * The cache is persisted as a server-sealed account envelope in localStorage.
 * The device retains no decryption key. Reload recovery needs an authenticated
 * server round trip; plaintext stays in memory. Legacy clear caches are purged.
 *
 * The app is fully rendered client-side: a full reload would start
 * from scratch — bundle, session restore, then a dozen requests before
 * the first useful content. By rehydrating the cache from disk, the page
 * immediately repaints the last known state, while the realtime bridge
 * (lib/realtime-provider.tsx) and mount refetches reconcile behind.
 * This is stale-while-revalidate, not a source of truth: nothing is served
 * from disk beyond PERSIST_MAX_AGE_MS.
 *
 * WHAT THIS IMPOSES ON THE REST OF THE APP. The restore is asynchronous and
 * does not hold reads: observers fetch at mount while the sealed snapshot
 * opens, so a relaunch does not add that server round trip before every
 * startup request. Data from this load stays newer than restored data, and a
 * query still in flight shows the restored entry until its live answer.
 * The UI loading flag reads `isPending`, never `isLoading`
 * (= `isPending && isFetching`), which is FALSE for a pending query without a
 * request in flight, and `enabled && isPending` when the query has a guard
 * (a disabled query remains `pending` forever). Locked by
 * lib/query-loading.test.ts.
 */

/** Storage key. See clearPersistedQueryCache() for purging on logout. */
export const QUERY_CACHE_STORAGE_KEY = "minddy.query-cache";

/**
 * Beyond that, the snapshot is discarded rather than rehydrated: redisplay a board from it
 * a week ago the time for a refetch would be worse than the skeleton.
 */
const PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Persisted board/list queries survive as long as their disk snapshot.
 * Large memory-only payloads override this default with shorter retention.
 */
const GC_TIME_MS = PERSIST_MAX_AGE_MS;

/**
 * Invalidates any snapshot written by an earlier version of the client. To bumper
 * whenever a form of cached data changes in an incompatible way — otherwise an old snapshot would be rehydrated in code that can no longer read it.
 */
const PERSIST_BUSTER = "v1";

/** Includes providers that are still restoring when logout occurs. */
const persistenceStops = new Set<() => void>();

/**
 * What DOES NOT go to disk.
 *
 * `MEMORY_ONLY_PAYLOAD_PREFIXES` in query-retention.ts also excludes full PR
 * details, commit/local diffs and other large payloads with shorter inactive GC.
 *
 * - `["me","search-index"]`: up to 4,000 lines, or the localStorage quota at
 * alone (~5 MB); it is anyway designed to be reloaded once
 * per tab, upon inactivity (lib/use-search-index.ts).
 * - agent execution flows: they pollute every second and expire
 * just as quickly — a snapshot would display a completed run as active. They
 * all carry `refetchOnMount: "always"` (lib/use-agent-runs.ts), so excluding them
 * costs nothing: they left the server anyway.
 * - `["billing", …]`: rights and quotas. Restarting the server avoids opening a
 * paid feature based on a disk cache.
 * - `["version"]`: the SHA of the deployment (MIN-157). Rehydrated from the
 * disk, it would turn on the “new version” banner again just after the
 * reload which has just updated the app — a systematic false positive
 *, and which nothing would turn off.
 * - `["page", id]`: the BODY of a page (MIN-271). A document is up to
 * 1 MB (the server cap), and the localStorage quota is ~5 MB:
 * three open pages would be enough to saturate it, which would not degrade
 * page persistence — it would drop the WHOLE snapshot, including board
 *. The list (`["pages", projectId]`), which does not have the bodies, remains
 * persisted: it is this which paints the tree instantly.
 *
 * The prefixes below are the REAL keys (see lib/use-agent-runs.ts):
 * deviating from it would result in a list that filters nothing while claiming the
 * to the contrary. This happened three times at once (MIN-303) — `["agent-activity"]`
 * for `["agent-active-issues"]`, a `["agent-run-pr"]` which does not designate any
 * query in the repository, and a `["agent-run-diff"]` which does not cover NOT
 * `["agent-run-diff-stat"]` (the comparison is segment by segment, not
 * character by character). The activity poll, which runs every 4
 * seconds when an agent is working, was therefore serialized to disk every
 * tick. **Any entry added here checks against its real key, and
 * its test in lib/query-persist.test.ts reads as a proof, not as
 * a repeat of this list.**
 */
const NON_PERSISTED_KEY_PREFIXES: string[][] = [
  ["native-agent-models"], // Subscription catalogs are bound to the current connection generation.
  ["project-icon"], // Authorized image bytes belong only to the current account's memory cache.
  ["app-tabs"], // Unbounded account collection; only local activation uses sessionStorage.
  ["me", "search-index"],
  ["me", "pages", "search"], // Per-keystroke snippets are bounded in memory, never restored from disk.
  ["me", "board-issues"], // short-lived resume snapshot; duplicates full issue rows
  ["agent-run"], // ["agent-run", runId]
  ["agent-runs"], // ["agent-runs", "issue", issueId]
  ["agent-run-events"],
  ["agent-run-diff"],
  ["agent-run-diff-stat"], // distinct segment: ["agent-run-diff"] does not cover it
  ["agent-sessions"], // ["agent-sessions", "all"]
  ["agent-active-issues"], // components/agent/agent-activity-context.tsx
  ["pull-requests"], // ["pull-requests", "all"]
  ["pr-comments"],
  ["pr-review-comments"],
  ["billing"],
  ["version"], // lib/use-new-version.ts
  ["page"], // ["page", pageId] — the BODY, not the list ["pages", projectId]
];

/** Exported for unit testing (lib/query-persist.test.ts). */
export function isPersistableKey(key: readonly unknown[]): boolean {
  return !isMemoryOnlyPayload(key) && !NON_PERSISTED_KEY_PREFIXES.some((prefix) =>
    prefix.every((segment, i) => key[i] === segment)
  );
}

function isPersistable(query: Query): boolean {
  // A query in error must not freeze its failure on disk.
  if (query.state.status !== "success") return false;
  // Pending/failed comments retain recovery callbacks and unconfirmed content.
  // Reopen from authoritative data after a reload; never restore a false success.
  if ((query.queryKey[0] === "comments" || query.queryKey[0] === "page-comments") &&
      Array.isArray(query.state.data) && query.state.data.some((comment) => (comment?.delivery || comment?.optimisticEdit))) return false;
  return isPersistableKey(query.queryKey);
}

/**
 * A persisted entry predates this provider mount. Queries that completed after
 * that boundary came from the current page load and must not be invalidated by
 * the restore callback.
 */
export function wasRestoredBeforeMount(
  query: Pick<Query, "queryKey" | "state">,
  mountedAt: number,
): boolean {
  const updatedAt = query.state.dataUpdatedAt;
  return updatedAt > 0 && updatedAt < mountedAt && isPersistableKey(query.queryKey);
}

/**
 * Hydration keeps whichever side has the newer `dataUpdatedAt`. A device clock
 * corrected between sessions could date disk data after this mount. Keep every
 * restored entry older than the mount so data from this load always wins and
 * the post-restore refresh still recognizes the entry.
 */
function datedBeforeMount(client: PersistedClient | undefined, mountedAt: number): PersistedClient | undefined {
  const queries = client?.clientState?.queries;
  if (!client || !Array.isArray(queries)) return client;
  return { ...client, clientState: { ...client.clientState, queries: queries.map((query) =>
    query.state.dataUpdatedAt < mountedAt ? query : { ...query, state: { ...query.state, dataUpdatedAt: mountedAt - 1 } }) } };
}

/**
 * Purge the snapshot. Called at disconnection: the cache carries the data of the
 * account which is leaving, and the machine can be shared.
 */
export function clearPersistedQueryCache() {
  invalidateLocalSnapshotWrites();
  // Cancel queued snapshots before removing storage. Otherwise a delayed write
  // or pagehide flush could restore the departing account's data after logout.
  for (const stop of persistenceStops) stop();
  persistenceStops.clear();
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(QUERY_CACHE_STORAGE_KEY);
    window.localStorage.removeItem("minddy:status-errors");
    window.localStorage.removeItem("minddy:drafts:issue");
    window.localStorage.removeItem("minddy:drafts:objective");
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("minddy:database-list:") || key === "minddy-cp:history" || key === "minddy-cp-destinations:history") {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage unavailable (private browsing, quota) — nothing to purge.
  }
}

export function AppQueryProvider({ children }: { children: ReactNode }) {
  const [mountedAt] = useState(() => Date.now());
  const restorePromise = useRef<Promise<void> | null>(null);
  const [queryClient] = useState(
    () => {
      const client = new QueryClient({
        defaultOptions: {
          queries: {
            // The coolness comes from the real-time bridge, not from the clock: since
            // MIN-89 it covers ALL my projects, plus aggregated caches.
            staleTime: 5 * 60_000,
            gcTime: GC_TIME_MS,
            // Healthy caches are kept fresh by realtime. Failed reads need a
            // recovery opportunity even after a brief window or tab switch.
            refetchOnWindowFocus: (query) => query.state.status === "error",
            retry: retryTemporaryReadFailure,
          },
        },
      });
      observePageReadFailures(client);
      configurePayloadRetention(client);
      return client;
    }
  );

  const [persistOptions] = useState(() => {
    let storage: Storage | undefined;
    try {
      if (typeof window !== "undefined") storage = window.localStorage;
    } catch {
      // Storage can be inaccessible in private or embedded browsing contexts.
    }
    const persister = createQueryStorage(storage, QUERY_CACHE_STORAGE_KEY, () => {
      const hashes = new Set(navigationWorkingSetQueryHashes(queryClient));
      for (const query of queryClient.getQueryCache().getAll()) {
        if (query.isActive()) hashes.add(query.queryHash);
      }
      return hashes;
    });
    return {
      queryClient,
      persister: { ...persister, restoreClient: async () => datedBeforeMount(await persister.restoreClient(), mountedAt) },
      maxAge: PERSIST_MAX_AGE_MS,
      buster: PERSIST_BUSTER,
      dehydrateOptions: { shouldDehydrateQuery: isPersistable },
    };
  });

  useEffect(() => {
    let stopped = false;
    let persistence: ReturnType<typeof subscribeToQueryPersistence> | undefined;
    const stop = () => {
      stopped = true;
      persistence?.stop();
    };
    const retire = () => {
      stop();
      queryClient.clear();
    };
    persistenceStops.add(retire);
    if (!restorePromise.current) {
      restorePromise.current = persistQueryClientRestore(persistOptions);
    }
    void restorePromise.current
      .then(() => {
        // Disk snapshots need one refresh because realtime events are not
        // replayed while the tab is closed. The cache also contains queries
        // that finished during this startup, however. Invalidating the entire
        // cache here made those live requests run twice (and `always` mount
        // queries up to three times in development).
        //
        // Refresh only entries whose timestamp proves they came from before
        // this provider mount. `invalidateQueries` deduplicates observers and
        // starts one request per active restored query. A query with a request
        // in flight already receives a live answer: invalidating it would
        // cancel that request, since it now holds restored data, and repeat it.
        if (stopped) return;
        void queryClient.invalidateQueries({
          predicate: (query) => query.state.fetchStatus === "idle" && wasRestoredBeforeMount(query, mountedAt),
          refetchType: "active",
        });
      })
      .catch(() => {})
      .finally(() => {
        if (stopped) return;
        persistence = subscribeToQueryPersistence({
          ...persistOptions,
          shouldPersistQuery: isPersistable,
          // Reads that completed while the snapshot opened are not on disk yet.
          unsavedSince: mountedAt,
        });
      });
    const flush = () => persistence?.flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      persistenceStops.delete(retire);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [mountedAt, persistOptions, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
