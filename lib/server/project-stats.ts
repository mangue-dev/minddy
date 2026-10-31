import "server-only";

import { listProjectPullRequestTimeline } from "@/lib/server/agent/issue-pull-requests";
import { listMembers, type ReadContext } from "@/lib/server/issue-reads";
import { loadProjectIssues } from "@/lib/server/project-working-set-readers";
import { dayInZone } from "@/lib/stats-derive";
import { calendarDaysBetween, parseDueDate } from "@/lib/due-date";
import { issueIdentifier } from "@/lib/issue-constants";
import {
  MOMENTUM_DAYS,
  RECENT_DAYS,
  STALLED_DAYS,
  medianLeadTimeSeconds,
  momentum,
  overdueIssues,
  projectHealth,
  pullRequestSummary,
  recentWeeks,
  stalledIssues,
  statusBreakdown,
  topContributors,
  weeklyFlow,
} from "@/lib/project-stats";

/**
 * Overdue and stalled tickets listed at most, the most urgent first; the
 * `health` counts give the full totals.
 */
const LISTED_ISSUES = 25;

const roundOne = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);

/**
 * The project statistics (MIN-878) for Numo's `get_project_stats` and the MCP
 * `minddy_get_project_stats`: the same derivations as the General settings,
 * plus the overdue and stalled tickets themselves so an agent can act on
 * them. The caller has already checked read access to the project.
 *
 * Calendar days are taken in `timeZone` for "today"; timestamps are bucketed
 * in the server's zone (UTC on the platform), which only moves a ticket
 * across a week boundary near midnight.
 */
export async function readProjectStats(
  ctx: ReadContext,
  { ownerId, timeZone, now = new Date() }: { ownerId: string; timeZone?: string | null; now?: Date },
): Promise<{ stats: Record<string, unknown> } | { error: string }> {
  if (!ctx.actorId) return { error: "A signed-in user is required." };
  const today = dayInZone(now.toISOString(), timeZone || "UTC") ?? now.toISOString().slice(0, 10);

  const [issuesResult, pullRequests, membersResult] = await Promise.all([
    loadProjectIssues({ supabase: ctx.db, user: { id: ctx.actorId } }, ctx.projectId),
    listProjectPullRequestTimeline(ctx.db, ctx.projectId).catch(() => null),
    listMembers(ctx, ownerId),
  ]);
  if (!issuesResult.ok) return { error: "The project's issues could not be read." };
  const issues = issuesResult.data;
  const names = new Map(
    "error" in membersResult
      ? []
      : membersResult.members.map((member) => [String(member.user_id), String(member.name)] as const),
  );
  const identifier = (number: number) => issueIdentifier(ctx.projectKey, number);
  const pace = momentum(issues, today);
  const prs = pullRequests ? pullRequestSummary(pullRequests, issues, today) : null;
  const leadTime = medianLeadTimeSeconds(issues, today);
  const overdue = overdueIssues(issues, now.getTime());
  const stalled = stalledIssues(issues, today);

  return {
    stats: {
      as_of: today,
      issues_total: issues.length,
      status_counts: Object.fromEntries(statusBreakdown(issues).map((slice) => [slice.status, slice.count])),
      health: projectHealth(issues, today, now.getTime()),
      overdue_issues: overdue.slice(0, LISTED_ISSUES).map((issue) => ({
        id: issue.id,
        identifier: identifier(issue.number),
        title: issue.title,
        status: issue.status,
        assignee_id: issue.assignee_id,
        due_date: issue.due_date,
        days_overdue: calendarDaysBetween(parseDueDate(issue.due_date)!, now),
      })),
      stalled_issues: stalled.slice(0, LISTED_ISSUES).map((issue) => ({
        id: issue.id,
        identifier: identifier(issue.number),
        title: issue.title,
        status: issue.status,
        assignee_id: issue.assignee_id,
        last_change: issue.updated_at,
      })),
      stalled_after_days: STALLED_DAYS,
      momentum: {
        window_days: MOMENTUM_DAYS,
        completed: pace.completed,
        completed_previous_window: pace.previousCompleted,
        change_percent: pace.changePercent,
        created_minus_completed: pace.netFlow,
      },
      median_lead_time_days: roundOne(leadTime === null ? null : leadTime / 86_400),
      lead_time_window_days: RECENT_DAYS,
      weekly_flow: weeklyFlow(issues, today).map((week) => ({
        week_start: week.week,
        created: week.created,
        completed: week.completed,
      })),
      contributors: topContributors(issues, today).map((contributor) => ({
        user_id: contributor.userId,
        name: names.get(contributor.userId) ?? null,
        completed_last_90_days: contributor.completed,
        open: contributor.open,
        // Open issues as they stand, closed ones over the last 90 days.
        by_status: Object.fromEntries(contributor.byStatus.map((slice) => [slice.status, slice.count])),
      })),
      // Null when the pull requests could not be read; zero totals when the
      // project simply has none linked.
      pull_requests: prs && {
        total: prs.total,
        open: prs.open,
        merged: prs.merged,
        closed_without_merge: prs.closed,
        median_hours_to_merge: roundOne(prs.medianHoursToMerge),
        shipped_through_pull_request_percent: prs.shippedThroughPullRequestPercent,
        merged_per_week: recentWeeks(today).map((week, index) => ({
          week_start: week,
          merged: prs.mergedPerWeek[index],
        })),
      },
    },
  };
}
