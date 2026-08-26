"use client";

import { QueryClient, type Query } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { useState, type ReactNode } from "react";

/**
 * The cache is PERSISTED in localStorage (MIN-89).
 *
 * The app is fully rendered client-side: a full reload would start
 * from scratch — bundle, session restore, then a dozen requests before
 * the first useful content. By rehydrating the cache from disk, the page
 * immediately repaints the last known state, while the realtime bridge
 * (lib/realtime-provider.tsx) and mount refetches reconcile behind.
 * This is stale-while-revalidate, not a source of truth: nothing is served
 * from disk beyond PERSIST_MAX_AGE_MS.
 *
 * WHAT THIS IMPOSES ON THE REST OF THE APP. The restore is asynchronous: the first
 * render is painted BEFORE it returns, and during this window
 * react-query forces `fetchStatus: "idle"` on all queries. They are therefore
 * `pending`, without data, and yet `isLoading` (= `isPending && isFetching`)
 * is FALSE. A screen that gates its blank state to `isLoading` then paints it an
 * image before its own skeleton — on all pages at once, since the
 * cause is this provider. The UI loading flag therefore reads
 * `isPending`, and `enabled && isPending` when the query has a guard (a disabled
 * query remains `pending` forever). Locked by
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
 * `gcTime` global ≥ `PERSIST_MAX_AGE_MS`: a query fetched in memory leaves the
 * snapshot, so a shorter gcTime would empty the disk over the session and
 * would cancel persistence.
 */
const GC_TIME_MS = PERSIST_MAX_AGE_MS;

/**
 * Invalidates any snapshot written by an earlier version of the client. To bumper
 * whenever a form of cached data changes in an incompatible way — otherwise an old snapshot would be rehydrated in code that can no longer read it.
 */
const PERSIST_BUSTER = "v1";

/**
 * What DOES NOT go to disk.
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
  ["me", "search-index"],
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
  return !NON_PERSISTED_KEY_PREFIXES.some((prefix) =>
    prefix.every((segment, i) => key[i] === segment)
  );
}

function isPersistable(query: Query): boolean {
  // A query in error must not freeze its failure on disk.
  if (query.state.status !== "success") return false;
  return isPersistableKey(query.queryKey);
}

/**
 * Purge the snapshot. Called at disconnection: the cache carries the data of the
 * account which is leaving, and the machine can be shared.
 */
export function clearPersistedQueryCache() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(QUERY_CACHE_STORAGE_KEY);
  } catch {
    // Storage unavailable (private browsing, quota) — nothing to purge.
  }
}

export function AppQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The coolness comes from the real-time bridge, not from the clock: since
            // MIN-89 it covers ALL my projects, plus aggregated caches.
            staleTime: 5 * 60_000,
            gcTime: GC_TIME_MS,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  // Persist it touches localStorage: it can only be built at the first
  // rendered client. useState(fn) guarantees this.
  const [persistOptions] = useState(() => ({
    persister: createSyncStoragePersister({
      storage: typeof window === "undefined" ? undefined : window.localStorage,
      key: QUERY_CACHE_STORAGE_KEY,
      // The persister swallows its own write errors (quota exceeded): the
      // disk cache is a bonus, never a critical path.
      throttleTime: 1_000,
    }),
    maxAge: PERSIST_MAX_AGE_MS,
    buster: PERSIST_BUSTER,
    dehydrateOptions: { shouldDehydrateQuery: isPersistable },
  }));

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      onSuccess={() => {
        // The snapshot comes from the DISK: its freshness date is that of
        // last tab opened, and nothing says what has changed since then — the
        // deck broadcasts are not replayed. Without it, reloading less
        // five minutes after the snapshot did not request ANYTHING from the server
        // (`staleTime` not expired) and redisplayed the previous state, with confidence
        // fresh data. Reloading should always mean “tell me again
        // the truth.”
        //
        // `refetchType: "none"`: we mark expired without launching a query here.
        // The mounted caches restart by themselves immediately after, when the
        // `isRestoring` — this is the mount refetch, not a second train.
        void queryClient.invalidateQueries({ refetchType: "none" });
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
