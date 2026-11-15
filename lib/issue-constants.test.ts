import { describe, expect, it } from "vitest";
import {
  ALL_STATUSES,
  CLOSED_STATUSES,
  NOT_OPEN_STATUSES,
  OPEN_STATUSES,
  PRIORITIES,
  PRIORITY_RANK,
  isIssueStatus,
} from "./issue-constants";
import { PRIORITY_ORDER } from "./view-filter";

describe("status vocabulary", () => {
  it("puts every status in exactly one of open and not open", () => {
    const all = ALL_STATUSES.map((s) => s.value);
    expect([...OPEN_STATUSES, ...NOT_OPEN_STATUSES].sort()).toEqual([...all].sort());
    expect(OPEN_STATUSES.some((s) => NOT_OPEN_STATUSES.includes(s))).toBe(false);
    for (const closed of CLOSED_STATUSES) expect(NOT_OPEN_STATUSES).toContain(closed);
  });

  it("recognizes only known statuses", () => {
    expect(isIssueStatus("in_review")).toBe(true);
    expect(isIssueStatus("hasOwnProperty")).toBe(false);
    expect(isIssueStatus(undefined)).toBe(false);
  });
});

describe("priority ranks", () => {
  it("ranks every priority, urgent highest, and sorts urgent first", () => {
    expect(Object.keys(PRIORITY_RANK).sort()).toEqual(PRIORITIES.map((p) => p.value).sort());
    const byRank = [...PRIORITIES].sort((a, b) => PRIORITY_RANK[b.value] - PRIORITY_RANK[a.value]);
    expect(byRank.map((p) => p.value)).toEqual(["urgent", "high", "medium", "low", "none"]);
    const bySortOrder = [...PRIORITIES].sort((a, b) => PRIORITY_ORDER[a.value] - PRIORITY_ORDER[b.value]);
    expect(bySortOrder).toEqual(byRank);
  });
});
