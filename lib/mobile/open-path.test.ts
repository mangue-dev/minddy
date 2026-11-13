import { describe, expect, it } from "vitest";
import { resolveOpenPath } from "./open-path";

describe("resolveOpenPath", () => {
  it("opens the inbox in place instead of navigating to it", () => {
    expect(resolveOpenPath("/inbox")).toEqual({ kind: "inbox" });
    expect(resolveOpenPath("/inbox/")).toEqual({ kind: "inbox" });
    expect(resolveOpenPath("/home?inbox=1")).toEqual({ kind: "inbox" });
  });

  it("navigates to any other page with its query and hash", () => {
    expect(resolveOpenPath("/projects/min-3f2a9c81?issue=MIN-42")).toEqual({
      kind: "navigate",
      href: "/projects/min-3f2a9c81?issue=MIN-42",
    });
    expect(resolveOpenPath("/projects/min-3f2a9c81/pages/pg#b2")).toEqual({
      kind: "navigate",
      href: "/projects/min-3f2a9c81/pages/pg#b2",
    });
  });

  it("refuses what is not a path of this server", () => {
    expect(resolveOpenPath("https://example.com/inbox")).toBeNull();
    expect(resolveOpenPath("//example.com/inbox")).toBeNull();
    expect(resolveOpenPath("inbox")).toBeNull();
  });
});
