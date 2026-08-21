import { describe, expect, it } from "vitest";
import { moveIssueGroupsToEnd } from "./group-order";

describe("moveIssueGroupsToEnd", () => {
  it("puts ticket groups after every other result group", () => {
    const groups = [
      { key: "pages", label: "Navigation" },
      { key: "issues", label: "Tickets" },
      { key: "objectives", label: "Objectives" },
      { key: "settings-account", label: "Account settings" },
      { key: "wiki-pages", label: "Pages" },
    ];

    expect(moveIssueGroupsToEnd(groups).map((group) => group.key)).toEqual([
      "pages",
      "objectives",
      "settings-account",
      "wiki-pages",
      "issues",
    ]);
  });

  it("preserves the relative order of non-ticket and ticket groups", () => {
    const groups = [
      { key: "issues", id: "first-ticket-group" },
      { key: "create", id: "create" },
      { key: "issues", id: "second-ticket-group" },
      { key: "account", id: "account" },
    ];

    expect(moveIssueGroupsToEnd(groups).map((group) => group.id)).toEqual([
      "create",
      "account",
      "first-ticket-group",
      "second-ticket-group",
    ]);
  });
});
