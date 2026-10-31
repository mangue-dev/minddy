import { ALL_STATUSES, isClosedStatus, type IssueStatus } from "./issue-constants";
import { addDays, isoDow, todayISO } from "./cycle";
import { isDueDateOverdue, parseDueDate } from "./due-date";
import type { Issue } from "./types";

// Project statistics (MIN-878): pure derivations of what a project's board
// already holds — its issues, and the dates of the pull requests linked to
// them. No React, no I/O, so the figures are tested in Node and computed in
// the browser from the board's own cache.
//
// Conventions:
//   - Timestamps are bucketed on the viewer's calendar day (`todayISO` of the
//     instant), weeks start on Monday.
//   - "Completed" means status `done` with a `completed_at`; a canceled or
//     duplicate ticket is closed but never counts as delivered work.

/** The issue fields the statistics read. */
export type StatsIssue = Pick<
  Issue,
  | "id"
  | "status"
  | "assignee_id"
  | "due_date"
  | "created_at"
  | "updated_at"
  | "completed_at"
>;

/** One linked pull request, as `GET /api/projects/[id]/pull-request-stats` returns it. */
export interface PullRequestTimelineEntry {
  id: string;
  state: "draft" | "open" | "merged" | "closed";
  openedAt: string | null;
  mergedAt: string | null;
  /** The project's tickets this pull request is linked to. */
  issueIds: string[];
}

/** Weeks shown by the flow charts. */
export const FLOW_WEEKS = 12;
/** The momentum compares this many recent days with the same span before. */
export const MOMENTUM_DAYS = 28;
/** Lead time and contributors look this far back. */
export const RECENT_DAYS = 90;
/** An in-flight ticket untouched for this long counts as stalled. */
export const STALLED_DAYS = 14;
/** Contributors listed at most. */
export const TOP_CONTRIBUTORS = 5;

const dayOf = (timestamp: string): string => todayISO(new Date(timestamp));
const weekOf = (day: string): string => addDays(day, 1 - isoDow(day));

const isCompleted = (issue: StatsIssue): issue is StatsIssue & { completed_at: string } =>
  issue.status === "done" && !!issue.completed_at;

/** Middle value of a list, or null when it is empty. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** The Monday of each of the last `count` weeks, oldest first. */
export function recentWeeks(today: string, count = FLOW_WEEKS): string[] {
  const current = weekOf(today);
  return Array.from({ length: count }, (_, index) => addDays(current, (index - count + 1) * 7));
}

function countByWeek(weeks: string[], days: string[]): number[] {
  const index = new Map(weeks.map((week, i) => [week, i]));
  const counts = weeks.map(() => 0);
  for (const day of days) {
    const slot = index.get(weekOf(day));
    if (slot !== undefined) counts[slot] += 1;
  }
  return counts;
}

export interface FlowWeek {
  /** Monday of the week, `YYYY-MM-DD`. */
  week: string;
  created: number;
  completed: number;
}

/** Tickets created and completed per week, oldest week first. */
export function weeklyFlow(issues: StatsIssue[], today: string, count = FLOW_WEEKS): FlowWeek[] {
  const weeks = recentWeeks(today, count);
  const created = countByWeek(weeks, issues.map((issue) => dayOf(issue.created_at)));
  const completed = countByWeek(
    weeks,
    issues.filter(isCompleted).map((issue) => dayOf(issue.completed_at)),
  );
  return weeks.map((week, index) => ({ week, created: created[index], completed: completed[index] }));
}

export interface Momentum {
  /** Completed over the last `MOMENTUM_DAYS` days. */
  completed: number;
  /** Completed over the `MOMENTUM_DAYS` days before. */
  previousCompleted: number;
  /** Relative change in percent, null when there was nothing to compare with. */
  changePercent: number | null;
  /** Created minus completed over the recent span: above 0, the backlog grows. */
  netFlow: number;
}

/** Compares the recent delivery pace with the span just before it. */
export function momentum(issues: StatsIssue[], today: string, days = MOMENTUM_DAYS): Momentum {
  const since = addDays(today, -days + 1);
  const before = addDays(since, -days);
  let completed = 0;
  let previousCompleted = 0;
  let created = 0;
  for (const issue of issues) {
    if (dayOf(issue.created_at) >= since) created += 1;
    if (!isCompleted(issue)) continue;
    const day = dayOf(issue.completed_at);
    if (day >= since) completed += 1;
    else if (day >= before) previousCompleted += 1;
  }
  return {
    completed,
    previousCompleted,
    changePercent: previousCompleted > 0
      ? Math.round(((completed - previousCompleted) / previousCompleted) * 100)
      : null,
    netFlow: created - completed,
  };
}

export interface StatusSlice {
  status: IssueStatus;
  count: number;
}

/** Ticket count per status, in board order, empty statuses left out. */
export function statusBreakdown(issues: StatsIssue[]): StatusSlice[] {
  const counts = new Map<IssueStatus, number>();
  for (const issue of issues) counts.set(issue.status, (counts.get(issue.status) ?? 0) + 1);
  return ALL_STATUSES.flatMap(({ value }) => {
    const count = counts.get(value) ?? 0;
    return count > 0 ? [{ status: value, count }] : [];
  });
}

export interface ProjectHealth {
  open: number;
  /** Open tickets past their due date. */
  overdue: number;
  /** Open tickets nobody holds. */
  unassigned: number;
  /** In progress or in review, without any change for `STALLED_DAYS` days. */
  stalled: number;
}

/** The board's own rule (lib/due-date.ts): a dated hour is late once passed, a day once it is over. */
const isOverdue = (issue: StatsIssue, now: number) => {
  const due = parseDueDate(issue.due_date);
  return !isClosedStatus(issue.status) && !!due && isDueDateOverdue(due, now);
};
const dueTime = (issue: StatsIssue) => parseDueDate(issue.due_date)?.getTime() ?? 0;

const isStalled = (issue: StatsIssue, today: string) =>
  (issue.status === "in_progress" || issue.status === "in_review") &&
  dayOf(issue.updated_at) <= addDays(today, -STALLED_DAYS);

/** Open tickets past their due date, the longest overdue first. */
export function overdueIssues<T extends StatsIssue>(issues: T[], now: number = Date.now()): T[] {
  return issues
    .filter((issue) => isOverdue(issue, now))
    .sort((a, b) => dueTime(a) - dueTime(b));
}

/** In-flight tickets without any change for `STALLED_DAYS` days, the oldest first. */
export function stalledIssues<T extends StatsIssue>(issues: T[], today: string): T[] {
  return issues
    .filter((issue) => isStalled(issue, today))
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at));
}

export function projectHealth(issues: StatsIssue[], today: string, now: number = Date.now()): ProjectHealth {
  const health: ProjectHealth = { open: 0, overdue: 0, unassigned: 0, stalled: 0 };
  for (const issue of issues) {
    if (isClosedStatus(issue.status)) continue;
    health.open += 1;
    if (isOverdue(issue, now)) health.overdue += 1;
    if (!issue.assignee_id) health.unassigned += 1;
    if (isStalled(issue, today)) health.stalled += 1;
  }
  return health;
}

/**
 * Median seconds from creation to completion of the tickets completed over
 * the last `RECENT_DAYS` days, null without any.
 */
export function medianLeadTimeSeconds(issues: StatsIssue[], today: string): number | null {
  const since = addDays(today, -RECENT_DAYS + 1);
  const durations = issues
    .filter(isCompleted)
    .filter((issue) => dayOf(issue.completed_at) >= since)
    .map((issue) => Math.max(0, (Date.parse(issue.completed_at) - Date.parse(issue.created_at)) / 1000));
  return median(durations);
}

export interface Contributor {
  userId: string;
  /** Tickets completed over the last `RECENT_DAYS` days. */
  completed: number;
  /** Tickets they hold that are still open. */
  open: number;
  /**
   * Their tickets per status: open ones as they stand, closed ones (done,
   * canceled, duplicate) when closed over the last `RECENT_DAYS` days.
   */
  byStatus: StatusSlice[];
}

/** Who delivered most recently, then who holds the most open work. */
export function topContributors(
  issues: StatsIssue[],
  today: string,
  limit = TOP_CONTRIBUTORS,
): Contributor[] {
  const since = addDays(today, -RECENT_DAYS + 1);
  const byUser = new Map<string, { completed: number; open: number; statuses: Map<IssueStatus, number> }>();
  for (const issue of issues) {
    if (!issue.assignee_id) continue;
    const closed = isClosedStatus(issue.status);
    // A closed ticket counts while recent; its close date is `completed_at`,
    // or its last change for a row closed without one.
    if (closed && dayOf(issue.completed_at ?? issue.updated_at) < since) continue;
    let entry = byUser.get(issue.assignee_id);
    if (!entry) byUser.set(issue.assignee_id, (entry = { completed: 0, open: 0, statuses: new Map() }));
    entry.statuses.set(issue.status, (entry.statuses.get(issue.status) ?? 0) + 1);
    if (issue.status === "done") entry.completed += 1;
    if (!closed) entry.open += 1;
  }
  return [...byUser]
    .map(([userId, entry]) => ({
      userId,
      completed: entry.completed,
      open: entry.open,
      byStatus: ALL_STATUSES.flatMap(({ value }) => {
        const count = entry.statuses.get(value) ?? 0;
        return count > 0 ? [{ status: value, count }] : [];
      }),
    }))
    .sort((a, b) => b.completed - a.completed || b.open - a.open || a.userId.localeCompare(b.userId))
    .slice(0, limit);
}

export interface PullRequestSummary {
  total: number;
  /** Open and draft pull requests. */
  open: number;
  merged: number;
  closed: number;
  /** Median hours from opening to merge, null without a dated merge. */
  medianHoursToMerge: number | null;
  /** Merges per week, aligned on `recentWeeks`. */
  mergedPerWeek: number[];
  /** Share of completed tickets linked to a merged pull request, in percent. */
  shippedThroughPullRequestPercent: number | null;
}

export function pullRequestSummary(
  pullRequests: PullRequestTimelineEntry[],
  issues: StatsIssue[],
  today: string,
  weeks = FLOW_WEEKS,
): PullRequestSummary {
  let open = 0;
  let merged = 0;
  let closed = 0;
  const mergeHours: number[] = [];
  const mergeDays: string[] = [];
  const shippedIssueIds = new Set<string>();
  for (const pr of pullRequests) {
    if (pr.state === "merged") {
      merged += 1;
      for (const id of pr.issueIds) shippedIssueIds.add(id);
      if (pr.mergedAt) {
        mergeDays.push(dayOf(pr.mergedAt));
        if (pr.openedAt) {
          const hours = (Date.parse(pr.mergedAt) - Date.parse(pr.openedAt)) / 3_600_000;
          if (Number.isFinite(hours) && hours >= 0) mergeHours.push(hours);
        }
      }
    } else if (pr.state === "closed") {
      closed += 1;
    } else {
      open += 1;
    }
  }
  const completed = issues.filter(isCompleted);
  const shipped = completed.filter((issue) => shippedIssueIds.has(issue.id)).length;
  return {
    total: pullRequests.length,
    open,
    merged,
    closed,
    medianHoursToMerge: median(mergeHours),
    mergedPerWeek: countByWeek(recentWeeks(today, weeks), mergeDays),
    shippedThroughPullRequestPercent: completed.length > 0
      ? Math.round((shipped / completed.length) * 100)
      : null,
  };
}
