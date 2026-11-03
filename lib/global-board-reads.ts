import type { IssueStatus } from "./issue-constants";

/**
 * The global board loads in two halves that leave together. The aggregate
 * read carries the open work (the default view's columns), so the board paints
 * as soon as it lands; the remaining statuses, usually the larger and older
 * share of an account's tickets, arrive beside it through GET /api/me/issues.
 *
 * Both paths are written here once: the browser requests them and the server
 * seeds them (lib/server/server-seed.ts) under exactly these strings.
 */
export const BOARD_FIRST_STATUSES: readonly IssueStatus[] = ["backlog", "todo", "in_progress", "in_review"];
export const BOARD_DEFERRED_STATUSES: readonly IssueStatus[] = ["triage", "done", "canceled", "duplicate"];

const DEFERRED = new Set<string>(BOARD_DEFERRED_STATUSES);

export function isDeferredBoardStatus(status: string): boolean {
  return DEFERRED.has(status);
}

export function globalBoardReadPath(timeZone: string): string {
  return `/api/me/board?tz=${encodeURIComponent(timeZone)}&statuses=${BOARD_FIRST_STATUSES.join(",")}`;
}

export const DEFERRED_BOARD_ISSUES_PATH = `/api/me/issues?statuses=${BOARD_DEFERRED_STATUSES.join(",")}`;
