import { describe, expect, it } from "vitest";
import { buildProjectIssueResponse } from "./project-issue-response";

describe("buildProjectIssueResponse", () => {
  it("flattens categories and counts issue-level resources", () => {
    const rows = [
      {
        id: "issue-1",
        title: "First",
        issue_categories: [{ category_id: "category-1" }],
      },
      { id: "issue-2", title: "Second", issue_categories: null },
    ];
    const result = buildProjectIssueResponse(rows, [
      { issue_id: "issue-1" },
      { issue_id: "issue-1" },
      { issue_id: "another-issue" },
      { issue_id: null },
    ]);

    expect(result).toEqual([
      {
        id: "issue-1",
        title: "First",
        category_ids: ["category-1"],
        resource_count: 2,
      },
      {
        id: "issue-2",
        title: "Second",
        category_ids: [],
        resource_count: 0,
      },
    ]);
  });
});
