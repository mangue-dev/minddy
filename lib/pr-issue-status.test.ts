import { describe, expect, it } from "vitest";
import { issueStatusForPrState } from "./pr-issue-status";

// The PURE rule that aligns an issue's status with its PR's state (MIN-46,
// corrected by MIN-138 for drafts). The database write (`applyIssueStatus`)
// cannot be tested in Node (server-only) and stays in
// `lib/server/agent/issue-status-sync`, which now only applies this table.

describe("issueStatusForPrState", () => {
  it("an open PR moves the issue to review", () => {
    expect(issueStatusForPrState("open")).toBe("in_review");
  });

  it("a DRAFT PR leaves the issue in progress: it is not ready for review", () => {
    // This is the MIN-138 fix: a draft returned `in_review`, which put work
    // nobody had submitted into the review queue.
    expect(issueStatusForPrState("draft")).toBe("in_progress");
  });

  it("a merged PR completes the issue", () => {
    expect(issueStatusForPrState("merged")).toBe("done");
  });

  it("a closed PR sends the issue back to todo, never canceled", () => {
    expect(issueStatusForPrState("closed")).toBe("todo");
  });

  it("a missing state implies no status", () => {
    expect(issueStatusForPrState(null)).toBeNull();
  });
});
