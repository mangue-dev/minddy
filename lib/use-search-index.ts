"use client";

// Cross-project search index for the command palette (MIN-91).
//
// The palette lists every ticket and every objective of every project, from any
// page — so the data can't come from the current project's caches. It comes
// from GET /api/me/search-index, in a shape trimmed to what a row needs.
//
// Two things keep that affordable:
// - it is fetched ONCE per tab, off the critical path: the query stays disabled
//   until the browser goes idle after mount (or until the palette is opened,
//   whichever comes first), so a page load never waits on it;
// - it is revalidated on palette open only when stale (`refetchQueries({ stale:
//   true })`), so hammering ⌘K doesn't hammer the server.
//
// Freshness: the index is a SNAPSHOT, and refreshing it costs 4000 rows.
// Three things keep it up to date without reloading it:
// - the CURRENT project does not read it: app-shell-chrome replaces its rows
//   with the live ["issues", projectId] / ["objectives", projectId] caches;
// - actions ⌘; patch the line they touch (patchSearchIndexIssue);
// - what is written ELSEWHERE (Numo, the MCP, a teammate) is placed line at
// line by the real-time bridge — writeIndexRow lower. Without him, a ticket
// created during the session could only be found in ⌘K upon full reload
// of the index, and only outside the current project.
// Complete reload remains the net: marked expired by the bridge, replayed at
// opening the palette.

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  SearchIndexIssue,
  SearchIndexObjective,
  SearchIndexResponse,
} from "./types";

export const SEARCH_INDEX_KEY = ["me", "search-index"] as const;

/** Minimum quiet period before background indexing can start. */
export const SEARCH_INDEX_ARM_DELAY_MS = 1_500;
/** Maximum additional idle wait after the quiet period. */
export const SEARCH_INDEX_IDLE_TIMEOUT_MS = 500;
/** How long an index snapshot is trusted before a palette open revalidates it. */
const SEARCH_INDEX_STALE_MS = 30_000;

export interface SearchIndexArmScheduler {
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(handle: number): void;
  requestIdleCallback?: (callback: () => void, options: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
}

/**
 * Keep background indexing out of the initial API burst. Explicit palette
 * opens bypass this scheduler through `armNow()`.
 */
export function scheduleSearchIndexArm(
  scheduler: SearchIndexArmScheduler,
  arm: () => void,
): () => void {
  let idleHandle: number | null = null;
  const delayHandle = scheduler.setTimeout(() => {
    if (scheduler.requestIdleCallback) {
      idleHandle = scheduler.requestIdleCallback(arm, {
        timeout: SEARCH_INDEX_IDLE_TIMEOUT_MS,
      });
      return;
    }
    arm();
  }, SEARCH_INDEX_ARM_DELAY_MS);

  return () => {
    scheduler.clearTimeout(delayHandle);
    if (idleHandle !== null) scheduler.cancelIdleCallback?.(idleHandle);
  };
}

async function fetchSearchIndexApi(): Promise<SearchIndexResponse> {
  const response = await fetch("/api/me/search-index");
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error || text.trim() || "Request failed";
    throw new Error(message);
  }
  if (data == null) throw new Error("Empty response");
  return data as SearchIndexResponse;
}

/**
 * The palette's cross-project index. `armNow()` short-circuits the idle wait
 * (call it when the palette opens); `refreshIfStale()` revalidates a snapshot
 * that has aged past SEARCH_INDEX_STALE_MS, and no-ops otherwise.
 */
export function useSearchIndex() {
  const queryClient = useQueryClient();
  const [armed, setArmed] = useState(false);

  // Arm after the startup burst, then on idle: the palette never competes
  // with the page's critical API requests unless the user explicitly opens it.
  useEffect(() => {
    if (armed) return;
    return scheduleSearchIndexArm(window, () => setArmed(true));
  }, [armed]);

  const { data } = useQuery({
    queryKey: SEARCH_INDEX_KEY,
    queryFn: fetchSearchIndexApi,
    enabled: armed,
    staleTime: SEARCH_INDEX_STALE_MS,
  });

  const armNow = useCallback(() => setArmed(true), []);

  const refreshIfStale = useCallback(() => {
    void queryClient.refetchQueries({ queryKey: SEARCH_INDEX_KEY, stale: true });
  }, [queryClient]);

  return { index: data ?? null, armNow, refreshIfStale };
}

/**
 * Patch one indexed ticket in place — used by the palette's command actions so the
 * row's status icon updates immediately, exactly like the per-project cache
 * patch does for the board. No-op when the index isn't loaded.
 */
export function patchSearchIndexIssue(
  queryClient: QueryClient,
  issueId: string,
  patch: Partial<SearchIndexIssue>
): void {
  queryClient.setQueryData<SearchIndexResponse>(SEARCH_INDEX_KEY, (old) =>
    old
      ? {
          ...old,
          issues: old.issues.map((i) => (i.id === issueId ? { ...i, ...patch } : i)),
        }
      : old
  );
}

/**
 * Add or remove a row from the index, for what is written ELSEWHERE
 * (lib/optimistic/remote-echo.ts).
 *
 * The patch above was not enough: it only affects rows ALREADY
 * indexed. A ticket that Numo just created is absent by definition, so the
 * palette previously found it only after a complete index reload (up to 4,000
 * rows, triggered when an outdated snapshot is opened). The current project is
 * the exception because app-shell-chrome replaces index rows with its live
 * caches; elsewhere, ⌘K ignored the ticket.
 *
 * An unknown line is put at the HEAD: the route sorts `updated_at desc`, and this
 * which has just been written is the most recent.
 */
function writeIndexRow<T extends { id: string }>(
  queryClient: QueryClient,
  slice: "issues" | "objectives",
  id: string,
  row: T | null
): void {
  queryClient.setQueryData<SearchIndexResponse>(SEARCH_INDEX_KEY, (old) => {
    if (!old) return old;
    const rows = old[slice] as unknown as T[];
    let next: T[];
    if (!row) {
      next = rows.filter((r) => r.id !== id);
      if (next.length === rows.length) return old;
    } else if (rows.some((r) => r.id === id)) {
      next = rows.map((r) => (r.id === id ? { ...r, ...row } : r));
    } else {
      next = [row, ...rows];
    }
    return { ...old, [slice]: next };
  });
}

export function upsertSearchIndexIssue(
  queryClient: QueryClient,
  issue: SearchIndexIssue
): void {
  writeIndexRow(queryClient, "issues", issue.id, issue);
}

export function removeSearchIndexIssue(
  queryClient: QueryClient,
  issueId: string
): void {
  writeIndexRow<SearchIndexIssue>(queryClient, "issues", issueId, null);
}

export function upsertSearchIndexObjective(
  queryClient: QueryClient,
  objective: SearchIndexObjective
): void {
  writeIndexRow(queryClient, "objectives", objective.id, objective);
}

export function removeSearchIndexObjective(
  queryClient: QueryClient,
  objectiveId: string
): void {
  writeIndexRow<SearchIndexObjective>(queryClient, "objectives", objectiveId, null);
}
