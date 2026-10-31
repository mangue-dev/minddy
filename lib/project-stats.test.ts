import { describe, expect, it } from "vitest";
import {
  median,
  momentum,
  medianLeadTimeSeconds,
  overdueIssues,
  stalledIssues,
  projectHealth,
  pullRequestSummary,
  recentWeeks,
  statusBreakdown,
  topContributors,
  weeklyFlow,
  type StatsIssue,
} from "./project-stats";

// Noon UTC keeps every timestamp on the same calendar day in any host timezone.
const at = (day: string) => `${day}T12:00:00Z`;
// A Friday: its week starts on Monday 2026-10-26.
const TODAY = "2026-10-30";
const NOW = new Date(`${TODAY}T12:00:00`).getTime();

let sequence = 0;
function issue(overrides: Partial<StatsIssue> = {}): StatsIssue {
  sequence += 1;
  return {
    id: `issue-${sequence}`,
    status: "todo",
    assignee_id: null,
    due_date: null,
    created_at: at("2026-10-01"),
    updated_at: at("2026-10-29"),
    completed_at: null,
    ...overrides,
  };
}

const done = (createdDay: string, completedDay: string, overrides: Partial<StatsIssue> = {}) =>
  issue({ status: "done", created_at: at(createdDay), completed_at: at(completedDay), ...overrides });

describe("median", () => {
  it("takes the middle value, or the mean of the two middle ones", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("weeklyFlow", () => {
  it("buckets creations and completions on Monday weeks, oldest first", () => {
    expect(recentWeeks(TODAY, 3)).toEqual(["2026-10-12", "2026-10-19", "2026-10-26"]);
    const flow = weeklyFlow(
      [
        issue({ created_at: at("2026-10-26") }),
        done("2026-10-20", "2026-10-30"),
        // Canceled work is closed, not delivered.
        issue({ status: "canceled", created_at: at("2026-10-13"), completed_at: at("2026-10-27") }),
        // Older than the window: ignored.
        done("2026-01-01", "2026-02-01"),
      ],
      TODAY,
      3,
    );
    expect(flow).toEqual([
      { week: "2026-10-12", created: 1, completed: 0 },
      { week: "2026-10-19", created: 1, completed: 0 },
      { week: "2026-10-26", created: 1, completed: 1 },
    ]);
  });
});

describe("momentum", () => {
  it("compares the last four weeks of delivery with the four before", () => {
    const result = momentum(
      [
        done("2026-09-01", "2026-10-20"),
        done("2026-09-01", "2026-10-10"),
        done("2026-09-01", "2026-10-05"),
        done("2026-09-01", "2026-09-20"),
        issue({ created_at: at("2026-10-29") }),
      ],
      TODAY,
    );
    expect(result).toEqual({ completed: 3, previousCompleted: 1, changePercent: 200, netFlow: -2 });
  });

  it("has no change to report without a previous span to compare with", () => {
    expect(momentum([done("2026-10-29", "2026-10-30")], TODAY)).toMatchObject({
      completed: 1,
      previousCompleted: 0,
      changePercent: null,
      netFlow: 0,
    });
  });
});

describe("statusBreakdown", () => {
  it("follows the board order and leaves empty statuses out", () => {
    expect(
      statusBreakdown([issue({ status: "done" }), issue({ status: "triage" }), issue({ status: "done" })]),
    ).toEqual([
      { status: "triage", count: 1 },
      { status: "done", count: 2 },
    ]);
  });
});

describe("projectHealth", () => {
  it("counts open, overdue, unassigned and stalled tickets", () => {
    expect(
      projectHealth(
        [
          issue({ due_date: "2026-10-29", assignee_id: "u1" }),
          issue({ status: "in_progress", assignee_id: "u1", updated_at: at("2026-10-10") }),
          issue({ status: "in_review", assignee_id: "u1", updated_at: at("2026-10-25") }),
          // Closed tickets are out of every count, even overdue.
          issue({ status: "done", due_date: "2026-01-01" }),
        ],
        TODAY,
        NOW,
      ),
    ).toEqual({ open: 3, overdue: 1, unassigned: 0, stalled: 1 });
  });
});

describe("overdueIssues and stalledIssues", () => {
  it("list what the health counts, the most urgent first", () => {
    const late = issue({ due_date: "2026-10-01" });
    const later = issue({ due_date: "2026-10-20" });
    const stale = issue({ status: "in_review", updated_at: at("2026-09-01") });
    const staler = issue({ status: "in_progress", updated_at: at("2026-08-01") });
    const issues = [later, stale, issue({ status: "canceled", due_date: "2026-01-01" }), late, staler];
    expect(overdueIssues(issues, NOW)).toEqual([late, later]);
    expect(stalledIssues(issues, TODAY)).toEqual([staler, stale]);
    expect(projectHealth(issues, TODAY, NOW)).toMatchObject({ overdue: 2, stalled: 2 });
  });
});

describe("medianLeadTimeSeconds", () => {
  it("measures recent completions only", () => {
    expect(
      medianLeadTimeSeconds(
        [done("2026-10-20", "2026-10-22"), done("2026-10-01", "2026-10-11"), done("2026-01-01", "2026-03-01")],
        TODAY,
      ),
    ).toBe(6 * 86_400);
    expect(medianLeadTimeSeconds([issue()], TODAY)).toBeNull();
  });
});

describe("topContributors", () => {
  it("ranks by recent completions, then by open work, with every status they hold", () => {
    expect(
      topContributors(
        [
          done("2026-10-01", "2026-10-20", { assignee_id: "b" }),
          issue({ status: "in_progress", assignee_id: "a" }),
          issue({ status: "in_review", assignee_id: "c" }),
          issue({ status: "backlog", assignee_id: "c" }),
          issue({ status: "canceled", assignee_id: "c", completed_at: at("2026-10-25") }),
          // Closed long ago: out of the 90 days.
          done("2026-01-01", "2026-02-01", { assignee_id: "a" }),
          done("2026-10-01", "2026-10-02"),
        ],
        TODAY,
      ),
    ).toEqual([
      { userId: "b", completed: 1, open: 0, byStatus: [{ status: "done", count: 1 }] },
      {
        userId: "c",
        completed: 0,
        open: 2,
        byStatus: [
          { status: "backlog", count: 1 },
          { status: "in_review", count: 1 },
          { status: "canceled", count: 1 },
        ],
      },
      { userId: "a", completed: 0, open: 1, byStatus: [{ status: "in_progress", count: 1 }] },
    ]);
  });
});

describe("pullRequestSummary", () => {
  it("counts states, merge time, weekly merges and tickets shipped through a merge", () => {
    const shipped = done("2026-10-01", "2026-10-28");
    const summary = pullRequestSummary(
      [
        { id: "p1", state: "merged", openedAt: "2026-10-27T10:00:00Z", mergedAt: "2026-10-28T10:00:00Z", issueIds: [shipped.id] },
        { id: "p2", state: "merged", openedAt: "2026-10-13T10:00:00Z", mergedAt: "2026-10-13T14:00:00Z", issueIds: [] },
        { id: "p3", state: "draft", openedAt: null, mergedAt: null, issueIds: [] },
        { id: "p4", state: "closed", openedAt: null, mergedAt: null, issueIds: [] },
      ],
      [shipped, done("2026-10-01", "2026-10-02")],
      TODAY,
      3,
    );
    expect(summary).toEqual({
      total: 4,
      open: 1,
      merged: 2,
      closed: 1,
      medianHoursToMerge: 14,
      mergedPerWeek: [1, 0, 1],
      shippedThroughPullRequestPercent: 50,
    });
  });
});

describe("overdue timestamps", () => {
  it("follows the board: a dated hour is late once passed, a day once it is over", () => {
    const pastHour = issue({ due_date: new Date(NOW - 3_600_000).toISOString() });
    const laterToday = issue({ due_date: new Date(NOW + 3_600_000).toISOString() });
    const today = issue({ due_date: new Date(`${TODAY}T00:00:00`).toISOString() });
    expect(overdueIssues([pastHour, laterToday, today], NOW)).toEqual([pastHour]);
  });
});
