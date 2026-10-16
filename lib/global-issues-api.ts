"use client";

import { fetchClientRead } from "./client-read";

import type { QueryClient } from "@tanstack/react-query";
import {
  applyPendingIssues,
  GLOBAL_BOARD_KEY,
  issueWrites,
} from "./optimistic/issue-writes";
import type { GlobalBoardResponse, Issue } from "./types";

/** Short-lived, non-persisted snapshot used to close missed-broadcast gaps. */
export const GLOBAL_ISSUES_KEY = ["me", "board-issues"] as const;

const SNAPSHOT_STALE_MS = 5_000;
const SNAPSHOT_GC_MS = 30_000;

export interface GlobalIssueSnapshot {
  issues: Issue[];
  /** Client time immediately before the request left. */
  startedAt: number;
}

export async function fetchGlobalIssuesApi(signal?: AbortSignal): Promise<Issue[]> {
  const response = await fetchClientRead("/api/me/issues", { signal });
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
  if (!Array.isArray(data)) throw new Error("Invalid response");
  return data as Issue[];
}

export async function globalIssuesQueryFn({
  signal,
}: { signal?: AbortSignal } = {}): Promise<GlobalIssueSnapshot> {
  const startedAt = Date.now();
  return {
    issues: applyPendingIssues(await fetchGlobalIssuesApi(signal), startedAt),
    startedAt,
  };
}

/**
 * Replace an authoritative issue slice while retaining client-only aggregates
 * such as `resource_count` when the faster endpoint does not carry them.
 */
export function mergeIssueSnapshot(
  current: Issue[],
  snapshot: Issue[],
  snapshotStartedAt: number = Number.POSITIVE_INFINITY
): Issue[] {
  const currentById = new Map(current.map((issue) => [issue.id, issue]));
  const snapshotIds = new Set(snapshot.map((issue) => issue.id));
  const merged = snapshot.map((issue) => {
    const cached = currentById.get(issue.id);
    if (!cached) return issue;
    if (Date.parse(cached.updated_at) > Date.parse(issue.updated_at)) return cached;
    return { ...cached, ...issue };
  });
  const concurrentInsertions = current.filter(
    (issue) =>
      !snapshotIds.has(issue.id) &&
      Date.parse(issue.updated_at) > snapshotStartedAt
  );
  return concurrentInsertions.length > 0 ? [...merged, ...concurrentInsertions] : merged;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
      a.every((value, index) => sameValue(value, b[index]));
  }
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) if (!sameValue(left[key], right[key])) return false;
  return true;
}

/**
 * Whether a project row leaves the cached board row as it is. The board
 * endpoint never carries `resource_count`, so a board row without one is not
 * replaced only to gain it; a count the board already holds stays current.
 */
function sameBoardRow(cached: Issue, fetched: Issue): boolean {
  const keys = new Set([...Object.keys(cached), ...Object.keys(fetched)]);
  for (const key of keys) {
    if (key === "resource_count" && cached.resource_count === undefined) continue;
    if (!sameValue(cached[key as keyof Issue], fetched[key as keyof Issue])) return false;
  }
  return true;
}

/**
 * A successful project GET also makes that project's global slice current.
 *
 * Rows are replaced where they stand, and unchanged rows keep their identity:
 * the board stays in server order and an identical read re-renders nothing.
 * An unchanged slice leaves the query untouched, since writing it would also
 * clear an invalidation another event left armed.
 */
export function reconcileProjectIssuesInGlobalCache(
  queryClient: QueryClient,
  projectId: string,
  issues: Issue[]
): void {
  let changed = false;
  queryClient.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (current) => {
    if (!current) return undefined;
    const fetchedById = new Map(issues.map((issue) => [issue.id, issue]));
    const placed = new Set<string>();
    const next: Issue[] = [];
    for (const cached of current.issues) {
      const fetched = fetchedById.get(cached.id);
      if (!fetched || placed.has(cached.id)) {
        if (!fetched && cached.project_id !== projectId) next.push(cached);
        else changed = true;
        continue;
      }
      placed.add(cached.id);
      if (sameBoardRow(cached, fetched)) {
        next.push(cached);
      } else {
        next.push(fetched);
        changed = true;
      }
    }
    for (const issue of issues) {
      if (placed.has(issue.id)) continue;
      placed.add(issue.id);
      next.push(issue);
      changed = true;
    }
    return changed ? { ...current, issues: next } : undefined;
  });
  if (!changed) return;
  // The issue slice is current, but the aggregate metadata was not refreshed.
  void queryClient.invalidateQueries({
    queryKey: GLOBAL_BOARD_KEY,
    exact: true,
    refetchType: "none",
  });
}

/** Most ticket reads one coalesced window may use instead of a full board read. */
export const MAX_BOARD_ISSUE_READS = 8;

/** One ticket through the panel reader (same RLS and codec); null once it is hidden or trashed. */
async function fetchBoardIssue(id: string): Promise<Issue | null> {
  const response = await fetchClientRead(`/api/issues/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Request failed");
  const data = (await response.json()) as (Issue & { github_metadata?: unknown }) | null;
  if (!data || typeof data !== "object" || data.id !== id) throw new Error("Invalid response");
  // Only the panel shows GitHub sync metadata; board rows never carry it.
  const { github_metadata: _metadata, ...issue } = data;
  return issue as Issue;
}

/**
 * Bring the aggregate board up to date for a few remotely changed tickets by
 * reading only those tickets. A board read already in flight may predate the
 * change, so it is awaited rather than restarted and the ticket rows land on
 * top of it. Anything this cannot prove falls back to the full board refetch:
 * no observed board, too many tickets, or any failed read.
 */
export async function refreshBoardIssues(
  queryClient: QueryClient,
  ids: readonly string[]
): Promise<void> {
  const fullRead = () => queryClient.invalidateQueries({ queryKey: GLOBAL_BOARD_KEY });
  const board = queryClient.getQueryCache().find<GlobalBoardResponse>({ queryKey: GLOBAL_BOARD_KEY, exact: true });
  const idle = board?.state.fetchStatus === "idle";
  if (!board || board.getObserversCount() === 0 || (idle && board.state.data === undefined) ||
      ids.length === 0 || ids.length > MAX_BOARD_ISSUE_READS) {
    return fullRead();
  }
  const startedAt = Date.now();
  let rows: (Issue | null)[];
  try {
    [rows] = await Promise.all([
      Promise.all(ids.map(fetchBoardIssue)),
      idle ? undefined : board.promise?.catch(() => undefined),
    ]);
  } catch {
    return fullRead();
  }
  if (queryClient.getQueryData(GLOBAL_BOARD_KEY) === undefined) return fullRead();
  const hidden = new Set(ids.filter((id, index) => rows[index] === null && !issueWrites.hasUnsettledInsert(id)));
  const fetched = applyPendingIssues(rows.filter((row): row is Issue => row !== null), startedAt);
  const fetchedById = new Map(fetched.map((issue) => [issue.id, issue]));
  queryClient.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (current) => {
    if (!current) return undefined;
    let changed = false;
    const placed = new Set<string>();
    const next: Issue[] = [];
    for (const cached of current.issues) {
      if (hidden.has(cached.id)) {
        changed = true;
        continue;
      }
      const issue = fetchedById.get(cached.id);
      if (!issue || placed.has(cached.id)) {
        next.push(cached);
        continue;
      }
      placed.add(cached.id);
      // A row written after this read started (a later echo, a local edit) wins.
      const merged = Date.parse(cached.updated_at) > Date.parse(issue.updated_at)
        ? cached
        : { ...cached, ...issue };
      if (merged === cached || sameValue(cached, merged)) {
        next.push(cached);
      } else {
        next.push(merged);
        changed = true;
      }
    }
    for (const id of ids) {
      const issue = fetchedById.get(id);
      if (!issue || placed.has(id)) continue;
      placed.add(id);
      next.push(issue);
      changed = true;
    }
    return changed ? { ...current, issues: next } : undefined;
  });
}

/** Apply the all-project snapshot to every loaded Kanban issue cache. */
export function reconcileGlobalIssueSnapshot(
  queryClient: QueryClient,
  snapshot: GlobalIssueSnapshot
): void {
  queryClient.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (current) =>
    current
      ? {
          ...current,
          issues: mergeIssueSnapshot(
            current.issues,
            snapshot.issues,
            snapshot.startedAt
          ),
        }
      : current
  );

  const byProject = new Map<string, Issue[]>();
  for (const issue of snapshot.issues) {
    const projectIssues = byProject.get(issue.project_id);
    if (projectIssues) projectIssues.push(issue);
    else byProject.set(issue.project_id, [issue]);
  }

  for (const query of queryClient.getQueryCache().getAll()) {
    const key = query.queryKey;
    if (key.length !== 2 || key[0] !== "issues" || typeof key[1] !== "string") {
      continue;
    }
    const projectId = key[1];
    queryClient.setQueryData<Issue[]>(key, (current) =>
      current
        ? mergeIssueSnapshot(
            current,
            byProject.get(projectId) ?? [],
            snapshot.startedAt
          )
        : current
    );
  }

  // Keep the slower aggregate reconciliation armed for members, relations,
  // integrations, and cycles. Only its issue slice has been refreshed here.
  void queryClient.invalidateQueries({
    queryKey: GLOBAL_BOARD_KEY,
    exact: true,
    refetchType: "none",
  });
}

/** Fetch once across simultaneous resume/mount callers, then patch all caches. */
export async function refreshGlobalIssueSnapshot(
  queryClient: QueryClient
): Promise<GlobalIssueSnapshot> {
  const snapshot = await queryClient.fetchQuery({
    queryKey: GLOBAL_ISSUES_KEY,
    queryFn: globalIssuesQueryFn,
    staleTime: SNAPSHOT_STALE_MS,
    gcTime: SNAPSHOT_GC_MS,
  });
  reconcileGlobalIssueSnapshot(queryClient, snapshot);
  return snapshot;
}

/** A snapshot completed after a slow board request started wins its issue slice. */
export function fresherGlobalIssueSnapshot(
  queryClient: QueryClient | undefined,
  startedAt: number
): GlobalIssueSnapshot | null {
  if (!queryClient) return null;
  const state = queryClient.getQueryState<GlobalIssueSnapshot>(GLOBAL_ISSUES_KEY);
  return state?.data && state.dataUpdatedAt > startedAt ? state.data : null;
}
