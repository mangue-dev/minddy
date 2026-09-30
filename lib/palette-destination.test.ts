import { describe, expect, it } from "vitest";
import { paletteDestinationHref } from "./palette-destination";

describe("new-tab palette destinations", () => {
  it.each([
    "/home",
    "/projects/project-1",
    "/projects/project-1/pages/page-1",
    "/projects/project-1/pages/page-1#heading",
    "/projects/project-1/objectives?open=objective-1",
    "/projects/project-1?objective=objective-1",
    "/projects/project-1?family=parent-1",
    "/all?view=view-1",
    "/pull-requests?pr=pr-1",
    "/routines?routine=routine-1",
    "/settings?tab=security",
  ])("keeps the exact repeatable destination %s", (href) => {
    expect(paletteDestinationHref(href)).toBe(href);
  });

  it.each([
    undefined,
    "/projects/project-1?new=1",
    "/projects/project-1?issue=issue-1",
    "/routines?compose=1",
    "/home#transient-command",
    "/share/token",
    "https://example.com",
    "//example.com",
  ])("excludes unsupported or transient destination %s", (href) => {
    expect(paletteDestinationHref(href)).toBeNull();
  });

  it("canonicalizes saved-view selections without dropping their scope", () => {
    expect(paletteDestinationHref("/projects/project-1/?view=view-1&family=parent-1"))
      .toBe("/projects/project-1?family=parent-1&view=view-1");
  });
});
