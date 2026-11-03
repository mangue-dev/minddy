"use client";

import { fetchClientRead } from "./client-read";
import { apiErrorCode, HttpResponseError } from "./backend-availability";

import { applyPendingRelations } from "./optimistic/relation-writes";
import {
  applyPendingBoard,
  applyPendingIssues,
  GLOBAL_BOARD_KEY,
  issueWrites,
} from "./optimistic/issue-writes";
import {
  fetchGlobalIssuesApi,
  fresherGlobalIssueSnapshot,
  mergeIssueSnapshot,
  refreshGlobalIssueSnapshot,
} from "./global-issues-api";
import {
  DEFERRED_BOARD_ISSUES_PATH,
  globalBoardReadPath,
  isDeferredBoardStatus,
} from "./global-board-reads";
import type { QueryClient } from "@tanstack/react-query";
import type { GlobalBoardResponse, Issue } from "./types";

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Fetch the cross-project board payload (per-project members/categories/
    objectives + relations + cycles, and the issues in the open statuses of
    lib/global-board-reads.ts) for the "My/All" kanban (MIN-29, MIN-32). `tz`
    lets the server resolve the user's calendar day when reconciling cycles. */
export async function fetchGlobalBoardApi(
  signal?: AbortSignal
): Promise<GlobalBoardResponse> {
  const response = await fetchClientRead(globalBoardReadPath(browserTimeZone()), { signal });
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
    throw new HttpResponseError(message, response.status, apiErrorCode(data));
  }
  if (data == null) throw new Error("Empty response");
  return data as GlobalBoardResponse;
}

/**
 * The board endpoint does not carry `resource_count`. A count a project read
 * already gave the cached row survives, as in mergeIssueSnapshot, so the row
 * keeps its identity under structural sharing instead of losing the count.
 */
function keepResourceCounts(client: QueryClient | undefined, issues: Issue[]): Issue[] {
  const counts = new Map<string, number>();
  for (const issue of client?.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)?.issues ?? []) {
    if (issue.resource_count !== undefined) counts.set(issue.id, issue.resource_count);
  }
  if (counts.size === 0) return issues;
  return issues.map((issue) => {
    const count = counts.get(issue.id);
    return count === undefined || issue.resource_count !== undefined
      ? issue
      : { ...issue, resource_count: count };
  });
}

function compareNullable(a: number | null | undefined, b: number | null | undefined): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a < b ? -1 : 1;
}

/** The server's board order (lib/server/global-board-issues.ts), for joined halves. */
function sortBoardIssues(issues: Issue[]): Issue[] {
  return issues.sort((a, b) => compareNullable(a.position, b.position) ||
    compareNullable(a.number, b.number) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The newer copy of a ticket read twice (it changed status between the halves). */
function newer(a: Issue, b: Issue): Issue {
  return Date.parse(b.updated_at) > Date.parse(a.updated_at) ? b : a;
}

/** Join the open half with the other statuses, one row per ticket. */
function joinBoardHalves(first: Issue[], deferred: Issue[]): Issue[] {
  const byId = new Map(first.map((issue) => [issue.id, issue]));
  for (const issue of deferred) {
    const seen = byId.get(issue.id);
    byId.set(issue.id, seen ? newer(seen, issue) : issue);
  }
  return sortBoardIssues([...byId.values()]);
}

/**
 * Land the other statuses on the board the first half already painted. They
 * replace the deferred-status rows a previous board left in place: a cached
 * one they no longer carry was deleted, hidden or reopened before this read
 * started. Rows written after it started (an edit, an echo) win.
 */
export function mergeDeferredBoardIssues(
  current: Issue[],
  deferred: Issue[],
  startedAt: number
): Issue[] {
  const fetchedById = new Map(deferred.map((issue) => [issue.id, issue]));
  const next: Issue[] = [];
  for (const cached of current) {
    const fetched = fetchedById.get(cached.id);
    if (fetched) {
      fetchedById.delete(cached.id);
      next.push(Date.parse(cached.updated_at) > Date.parse(fetched.updated_at) ? cached : { ...cached, ...fetched });
    } else if (!isDeferredBoardStatus(cached.status) || Date.parse(cached.updated_at) > startedAt ||
        issueWrites.hasUnsettledInsert(cached.id)) {
      next.push(cached);
    }
  }
  return sortBoardIssues([...next, ...fetchedById.values()]);
}

/** The board's other statuses once they land after its first paint. */
async function landDeferredIssues(
  client: QueryClient,
  deferred: Promise<Issue[]>,
  startedAt: number,
  signal: AbortSignal | undefined
): Promise<void> {
  let rows: Issue[];
  try {
    rows = applyPendingIssues(await deferred, startedAt);
  } catch {
    if (signal?.aborted) return;
    // The complete issue read closes the gap instead. Failing that, the board
    // shows what it has and is marked stale for its next read; refetching now
    // would loop while the read keeps failing.
    try {
      await refreshGlobalIssueSnapshot(client);
    } catch {
      void client.invalidateQueries({ queryKey: GLOBAL_BOARD_KEY, exact: true, refetchType: "none" });
    }
    client.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (current) => current && settled(current));
    return;
  }
  // The first half resolves the query in this same turn; land after it is stored.
  await new Promise((resolve) => setTimeout(resolve, 0));
  client.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (current) =>
    current && settled({ ...current, issues: mergeDeferredBoardIssues(current.issues, rows, startedAt) }));
}

function settled(board: GlobalBoardResponse): GlobalBoardResponse {
  if (!board.deferred_pending) return board;
  const { deferred_pending: _pending, ...rest } = board;
  return rest;
}

/**
 * The `queryFn` of `["me","board"]`, shared by its three observers (the
 * board “All tickets”, the mentionables of Numo, the picker of the page
 * Agents). As for project tickets: starting time retained,
 * response passed through the pending writes register, so that a late response
 * does not replay the state before the edition (MIN-156).
 */
export async function globalBoardQueryFn({
  signal,
  client,
}: { signal?: AbortSignal; client?: QueryClient } = {}): Promise<GlobalBoardResponse> {
  const startedAt = Date.now();
  // Both halves leave now (lib/global-board-reads.ts); the open one paints.
  let deferredRows: Issue[] | undefined;
  const first = fetchGlobalBoardApi(signal);
  const deferred = fetchGlobalIssuesApi(signal, DEFERRED_BOARD_ISSUES_PATH);
  deferred.then((rows) => { deferredRows = rows; }, () => {});
  let fetched: GlobalBoardResponse;
  try {
    fetched = await first;
    // Without a client to land it later, the read waits for both halves.
    if (!client) deferredRows = await deferred;
  } catch (error) {
    deferred.catch(() => {});
    throw error;
  }
  const previous = client?.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY);
  // Until the rest lands, a previous complete board keeps its other-status
  // rows on screen, as a cached board always did while it refetched.
  const kept = deferredRows ?? (previous && !previous.deferred_pending
    ? previous.issues.filter((issue) => isDeferredBoardStatus(issue.status))
    : []);
  const pending = deferredRows === undefined && (!previous || previous.deferred_pending === true);
  const board: GlobalBoardResponse = {
    ...fetched,
    issues: keepResourceCounts(client, joinBoardHalves(fetched.issues, kept)),
    relations: applyPendingRelations(client, fetched.relations, startedAt),
    ...(pending ? { deferred_pending: true as const } : {}),
  };
  if (deferredRows === undefined && client) {
    void landDeferredIssues(client, deferred, startedAt, signal);
  }
  const snapshot = fresherGlobalIssueSnapshot(client, startedAt);
  return applyPendingBoard(
    snapshot
      ? {
          ...board,
          issues: mergeIssueSnapshot(
            board.issues,
            snapshot.issues,
            snapshot.startedAt
          ),
        }
      : board,
    startedAt
  );
}
