import { describe, expect, it } from "vitest";
import { mentionNavigationTarget } from "@/lib/mention-target";

describe("mention navigation", () => {
  it("opens an issue in place while retaining a canonical link target", () => {
    expect(mentionNavigationTarget("issue", "issue-1", "project-1")).toEqual({
      kind: "issue-panel",
      projectId: "project-1",
      issueId: "issue-1",
      href: "/projects/project-1?issue=issue-1",
    });
  });

  it("keeps objectives and pages as regular route navigation", () => {
    expect(mentionNavigationTarget("objective", "objective-1", "project-1")).toEqual({
      kind: "route",
      href: "/projects/project-1/objectives?open=objective-1",
    });
    expect(mentionNavigationTarget("page", "page-1", "project-1")).toEqual({
      kind: "route",
      href: "/projects/project-1/pages/page-1",
    });
  });

  it("does not invent a destination for unresolved or non-link mentions", () => {
    expect(mentionNavigationTarget("issue", "issue-1", null)).toBeNull();
    expect(mentionNavigationTarget("member", "member-1", "project-1")).toBeNull();
  });
});
