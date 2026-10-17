import { defaultFilter } from "cmdk";
import { describe, expect, it } from "vitest";
import {
  isExactIssueQuery,
  issueAwareFilter,
  issueSearchTier,
  issueTierKeyword,
  orderIssuesForSearch,
} from "./issue-search-order";

/** The issue search order of MIN-726, and the cmdk filter that applies it. */

const issues = [
  { id: "done", status: "done" },
  { id: "todo-1", status: "todo" },
  { id: "triage", status: "triage" },
  { id: "review", status: "in_review" },
  { id: "backlog", status: "backlog" },
  { id: "progress", status: "in_progress" },
  { id: "canceled", status: "canceled" },
  { id: "todo-2", status: "todo" },
  { id: "duplicate", status: "duplicate" },
];

describe("issue search order", () => {
  it("puts work under way first and non-open issues last, keeping relevance within a tier", () => {
    expect(orderIssuesForSearch(issues, (i) => i.status).map((i) => i.id)).toEqual([
      "review", "progress", "todo-1", "backlog", "todo-2", "done", "triage", "canceled", "duplicate",
    ]);
  });

  it("treats an unknown status as open rather than burying it", () => {
    expect(issueSearchTier("some_new_status")).toBe(1);
    expect(issueSearchTier(undefined)).toBe(1);
  });

  it("lets an exact identifier come before every tier", () => {
    const ordered = orderIssuesForSearch(issues, (i) => i.status, (i) => i.id === "done");
    expect(ordered[0].id).toBe("done");
  });

  it("recognizes the identifier, the number and #number as exact", () => {
    expect(isExactIssueQuery("min-42", "MIN-42")).toBe(true);
    expect(isExactIssueQuery("#42", "MIN-42", 42)).toBe(true);
    expect(isExactIssueQuery("42", null, 42)).toBe(true);
    expect(isExactIssueQuery("MIN-4", "MIN-42", 42)).toBe(false);
  });
});

describe("issueAwareFilter", () => {
  const filter = issueAwareFilter(defaultFilter);

  it("scores items without a tier exactly like cmdk", () => {
    expect(filter("Objective", "obj", ["Launch"])).toBe(defaultFilter("Objective", "obj", ["Launch"]));
  });

  it("never reveals an item cmdk would hide, and never matches the tier token", () => {
    expect(filter("id-1", "zzz", ["MIN-1", "Login", issueTierKeyword("in_progress")])).toBe(0);
    expect(filter("id-1", "tier", ["MIN-1", "Login", issueTierKeyword("todo")])).toBe(0);
  });

  it("ranks a better tier above a better text match, and an exact identifier above all", () => {
    const closedPerfect = filter("a", "login", ["MIN-1", "login", issueTierKeyword("done")]);
    const progressWeaker = filter("b", "login", ["MIN-2", "Login page redesign", issueTierKeyword("in_progress")]);
    // An exact title is still a text match: the tier wins.
    expect(progressWeaker).toBeGreaterThan(closedPerfect);
    const exactClosed = filter("c", "MIN-7", ["MIN-7", "Old work", issueTierKeyword("done")]);
    const progressPrefix = filter("d", "MIN-7", ["MIN-70", "Live work", issueTierKeyword("in_progress")]);
    expect(exactClosed).toBeGreaterThan(progressPrefix);
    const todoMatch = filter("e", "login", ["MIN-3", "Login page redesign", issueTierKeyword("todo")]);
    expect(progressWeaker).toBeGreaterThan(todoMatch);
  });
});
