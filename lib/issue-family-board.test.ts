import { describe, expect, it } from "vitest";

import {
  familyBoardStatuses,
  issueFamilyParentId,
  issueFamilyBoardExitHref,
  issueFamilyBoardHref,
  issueParentIds,
  resolveIssueFamily,
} from "./issue-family-board";

const issues = [
  { id: "parent", parent_id: null, status: "todo" },
  { id: "child-1", parent_id: "parent", status: "done" },
  { id: "grandchild", parent_id: "child-1", status: "backlog" },
  { id: "child-2", parent_id: "parent", status: "canceled" },
  { id: "unrelated", parent_id: null, status: "in_progress" },
];

describe("issue family board", () => {
  it("builds an encoded URL while preserving the current view", () => {
    expect(
      issueFamilyBoardHref(
        "project/id",
        "parent?one",
        "view=mine&objective=objective-1&issue=open-1&setup=import",
      ),
    ).toBe("/projects/project%2Fid?view=mine&family=parent%3Fone");
  });

  it("resolves the same family from its parent and a child", () => {
    const parentIds = new Set(["parent", "child-with-children"]);
    expect(issueFamilyParentId({ id: "parent", parent_id: null }, parentIds)).toBe(
      "parent",
    );
    expect(issueFamilyParentId({ id: "child", parent_id: "parent" }, parentIds)).toBe(
      "parent",
    );
    expect(
      issueFamilyParentId(
        { id: "child-with-children", parent_id: "parent" },
        parentIds,
      ),
    ).toBe("child-with-children");
    expect(issueFamilyParentId({ id: "solo", parent_id: null }, parentIds)).toBeNull();
  });

  it("returns to the same board view by removing only the family scope", () => {
    expect(
      issueFamilyBoardExitHref("project-1", "view=mine&family=parent"),
    ).toBe("/projects/project-1?view=mine");
  });

  it("keeps the parent and direct children regardless of status", () => {
    const family = resolveIssueFamily(issues, "parent");

    expect(family?.parent.id).toBe("parent");
    expect(family?.issues.map((issue) => issue.id)).toEqual([
      "parent",
      "child-1",
      "child-2",
    ]);
  });

  it("returns no scope for an unknown parent", () => {
    expect(resolveIssueFamily(issues, "missing")).toBeNull();
  });

  it("finds every issue that has at least one direct child", () => {
    expect([...issueParentIds(issues)]).toEqual(["parent", "child-1"]);
  });

  it("renders the same kanban sweep as every board — no triage, no duplicate", () => {
    // Like the objective page: `triage` (arrival zone) and `duplicate`
    // (closed as a copy) are not columns of their own, so members parked
    // there do not show on the family board.
    const columns = familyBoardStatuses().map((s) => s.value);
    expect(columns).toEqual([
      "backlog",
      "todo",
      "in_progress",
      "in_review",
      "done",
      "canceled",
    ]);
  });
});
