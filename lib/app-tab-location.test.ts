import { describe, expect, it } from "vitest";
import { appTabRoute, normalizeAppTabLocation } from "./app-tab-location";

describe("application tab destinations", () => {
  it.each(["/login", "/signup", "/share/token", "/f/token", "/p/token", "/connect/github", "/projects/p/pages-print/a", "//example.com", "/\\example.com", "/home\n", "/projects/p/unknown", "/home/extra", "/projects/%2f%2fevil"])("rejects unsupported destination %s", (href) => {
    expect(normalizeAppTabLocation(href)).toBeNull();
  });
  it("keeps repeatable selections and removes one-use commands", () => {
    expect(normalizeAppTabLocation("/routines?routine=a&new=1&setup=git&compose=1&billing=success")).toBe("/routines?routine=a");
    expect(normalizeAppTabLocation("/projects/p/pages/a?entry=b#heading")).toBe("/projects/p/pages/a?entry=b#heading");
    expect(normalizeAppTabLocation("/settings?tab=security&section=account-security#hint")).toBe("/settings?tab=security");
  });
  it("rejects the retired Numo routes (the FAB has no URL)", () => {
    expect(normalizeAppTabLocation("/agents?run=a")).toBeNull();
    expect(normalizeAppTabLocation("/numo?conversation=a")).toBeNull();
  });
  it("canonicalizes ordering and resolves project sections", () => {
    expect(normalizeAppTabLocation("/all/?view=b&tab=a")).toBe("/all?tab=a&view=b");
    expect(appTabRoute("/projects/p?view=b")).toEqual({ section: "tickets", projectId: "p", objectiveId: null, pageId: null, prId: null, routineId: null });
    expect(appTabRoute("/projects/p/pages/a")).toEqual({ section: "pages", projectId: "p", objectiveId: null, pageId: "a", prId: null, routineId: null });
  });
  it("exposes the objective param so tabs can name an objective's tickets", () => {
    expect(appTabRoute("/projects/p?objective=o")).toEqual({ section: "tickets", projectId: "p", objectiveId: "o", pageId: null, prId: null, routineId: null });
  });
  it("exposes the selection params a tab's title may mirror", () => {
    expect(appTabRoute("/pull-requests?pr=og")).toEqual({ section: "pull-requests", projectId: null, objectiveId: null, pageId: null, prId: "og", routineId: null });
    expect(appTabRoute("/routines?routine=rt")).toEqual({ section: "routines", projectId: null, objectiveId: null, pageId: null, prId: null, routineId: "rt" });
  });
});
