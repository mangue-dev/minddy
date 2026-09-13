import { describe, expect, it } from "vitest";
import { appTabRoute, normalizeAppTabLocation } from "./app-tab-location";

describe("application tab destinations", () => {
  it.each(["/login", "/signup", "/share/token", "/f/token", "/p/token", "/connect/github", "/projects/p/pages-print/a", "//example.com", "/\\example.com", "/home\n", "/projects/p/unknown", "/home/extra", "/projects/%2f%2fevil"])("rejects unsupported destination %s", (href) => {
    expect(normalizeAppTabLocation(href)).toBeNull();
  });
  it("keeps repeatable selections and removes one-use commands", () => {
    expect(normalizeAppTabLocation("/agents?run=a&issue=i&new=1&setup=git&compose=1&billing=success")).toBe("/agents?run=a");
    expect(normalizeAppTabLocation("/projects/p/pages/a?entry=b#heading")).toBe("/projects/p/pages/a?entry=b#heading");
    expect(normalizeAppTabLocation("/settings?tab=security&section=account-security#hint")).toBe("/settings?tab=security");
    expect(normalizeAppTabLocation("/numo?conversation=a")).toBe("/numo?conversation=a");
  });
  it("canonicalizes ordering and resolves project sections", () => {
    expect(normalizeAppTabLocation("/all/?view=b&tab=a")).toBe("/all?tab=a&view=b");
    expect(appTabRoute("/projects/p?view=b")).toEqual({ section: "tickets", projectId: "p" });
    expect(appTabRoute("/projects/p/pages/a")).toEqual({ section: "pages", projectId: "p" });
  });
});
