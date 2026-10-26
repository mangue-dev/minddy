import { describe, expect, it } from "vitest";
import {
  hierarchyAvailable,
  hierarchyCandidates,
  hierarchyPatches,
} from "./issue-hierarchy";

const issue = (id: string, parent_id: string | null = null, project_id = "p1") => ({
  id,
  parent_id,
  project_id,
});

// parent → child1, child2; solo and other are top-level without sub-issues;
// foreign lives in another project.
const parent = issue("parent");
const child1 = issue("child1", "parent");
const child2 = issue("child2", "parent");
const solo = issue("solo");
const other = issue("other");
const foreign = issue("foreign", null, "p2");
const all = [parent, child1, child2, solo, other, foreign];

const ids = (issues: { id: string }[]) => issues.map((i) => i.id);

describe("parent_of", () => {
  it("is not offered on a sub-issue, nor from a multi-selection", () => {
    expect(hierarchyAvailable("parent_of", [child1], all)).toBe(false);
    expect(hierarchyAvailable("parent_of", [solo, other], all)).toBe(false);
    expect(hierarchyAvailable("parent_of", [parent], all)).toBe(true);
  });

  it("lists same-project tickets without sub-issues that are not already its own", () => {
    expect(ids(hierarchyCandidates("parent_of", [parent], all))).toEqual(["solo", "other"]);
    // A sub-issue of another parent may move under this one.
    expect(ids(hierarchyCandidates("parent_of", [solo], all))).toEqual(["child1", "child2", "other"]);
  });

  it("writes the parent onto the picked ticket", () => {
    expect(hierarchyPatches("parent_of", [solo], "child1", all)).toEqual([
      { issueId: "child1", parent_id: "solo" },
    ]);
    expect(hierarchyPatches("parent_of", [child1], "solo", all)).toEqual([]);
  });
});

describe("sub_issue_of", () => {
  it("is not offered on a ticket that has sub-issues", () => {
    expect(hierarchyAvailable("sub_issue_of", [parent], all)).toBe(false);
    expect(hierarchyAvailable("sub_issue_of", [child1], all)).toBe(true);
    expect(hierarchyAvailable("sub_issue_of", [parent, solo], all)).toBe(true);
  });

  it("lists same-project top-level tickets, minus the current parent", () => {
    expect(ids(hierarchyCandidates("sub_issue_of", [solo], all))).toEqual(["parent", "other"]);
    expect(ids(hierarchyCandidates("sub_issue_of", [child1], all))).toEqual(["solo", "other"]);
  });

  it("moves every eligible selected ticket under the picked parent", () => {
    expect(hierarchyPatches("sub_issue_of", [solo, parent, child1, other], "other", all)).toEqual([
      { issueId: "solo", parent_id: "other" },
      { issueId: "child1", parent_id: "other" },
    ]);
  });
});
