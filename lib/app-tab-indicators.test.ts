import { describe, expect, it } from "vitest";
import { appTabIndicator, type AppTabIndicatorData } from "./app-tab-indicators";

const data: AppTabIndicatorData = {
  openPullRequests: 4,
  inbox: 2,
  smartAssignWarning: true,
  triageCounts: { a: { triage: 3, feedback: 1 }, b: { triage: 0, feedback: 2 } },
};

describe("appTabIndicator", () => {
  it("gives the Home tab the Smart Assign warning, and nothing without it", () => {
    expect(appTabIndicator({ section: "home" }, data)).toEqual({ kind: "alert" });
    expect(appTabIndicator({ section: "home" }, { ...data, smartAssignWarning: false })).toBeNull();
  });

  it("counts inbox and pull requests on their global tabs", () => {
    expect(appTabIndicator({ section: "inbox" }, data)).toEqual({ kind: "count", count: 2, label: "inboxBadge" });
    expect(appTabIndicator({ section: "pull-requests" }, data)).toEqual({ kind: "count", count: 4, label: "pullRequestsBadge" });
    expect(appTabIndicator({ section: "pull-requests" }, { ...data, openPullRequests: 0 })).toBeNull();
  });

  it("keeps project tabs to their own project's counters", () => {
    expect(appTabIndicator({ section: "triage", projectId: "a" }, data)).toEqual({ kind: "count", count: 3, label: "triageBadge" });
    expect(appTabIndicator({ section: "feedback", projectId: "b" }, data)).toEqual({ kind: "count", count: 2, label: "feedbackBadge" });
    expect(appTabIndicator({ section: "triage", projectId: "b" }, data)).toBeNull();
    expect(appTabIndicator({ section: "triage", projectId: "unknown" }, data)).toBeNull();
  });

  it("leaves pages without a sidebar badge bare", () => {
    expect(appTabIndicator({ section: "tickets", projectId: "a" }, data)).toBeNull();
    expect(appTabIndicator({ section: "routines" }, data)).toBeNull();
    // A project section never borrows a global counter.
    expect(appTabIndicator({ section: "inbox", projectId: "a" }, data)).toBeNull();
  });
});
