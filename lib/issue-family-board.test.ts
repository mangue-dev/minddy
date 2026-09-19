import { describe, expect, it } from "vitest";

import {
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
});
