"use client";

import type { QueryClient } from "@tanstack/react-query";
import {
  applyPendingIssues,
  GLOBAL_BOARD_KEY,
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
  const response = await fetch("/api/me/issues", { signal });
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

/** A successful project GET also makes that project's global slice current. */
export function reconcileProjectIssuesInGlobalCache(
  queryClient: QueryClient,
  projectId: string,
  issues: Issue[]
): void {
  queryClient.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (current) => {
    if (!current) return current;
    const others = current.issues.filter((issue) => issue.project_id !== projectId);
    return { ...current, issues: [...others, ...issues] };
  });
  // The issue slice is current, but the aggregate metadata was not refreshed.
  void queryClient.invalidateQueries({
    queryKey: GLOBAL_BOARD_KEY,
    exact: true,
    refetchType: "none",
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
