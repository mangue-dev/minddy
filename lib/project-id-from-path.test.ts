import { afterEach, describe, expect, it } from "vitest";
import { projectIdFromPath, projectTabHref } from "./project-id-from-path";
import { registerRecordIds, resetRefRegistry } from "./ref-registry";

const ID = "3f2a9c81-1d2e-4c3b-9a8f-0123456789ab";
const target = { id: "7b11c0de-0000-4000-8000-000000000001", key: "WEB" };

describe("project routes", () => {
  afterEach(resetRefRegistry);

  it("expands a readable project segment once the project is known", () => {
    expect(projectIdFromPath("/projects/min-3f2a9c81/pages")).toBeNull();
    registerRecordIds([{ id: ID, key: "MIN" }]);
    expect(projectIdFromPath("/projects/min-3f2a9c81/pages")).toBe(ID);
    // The key is decorative: a renamed key keeps resolving.
    expect(projectIdFromPath("/projects/old-3f2a9c81")).toBe(ID);
    expect(projectIdFromPath("/home")).toBeNull();
  });

  it("keeps legacy full ids working before anything is loaded", () => {
    expect(projectIdFromPath(`/projects/${ID}/objectives`)).toBe(ID);
  });

  it.each(["objectives", "pages", "triage", "feedback", "settings"])(
    "keeps the %s tab when switching projects",
    (tab) => {
      expect(projectTabHref(`/projects/min-3f2a9c81/${tab}`, target)).toBe(
        `/projects/web-7b11c0de/${tab}`,
      );
    },
  );

  it("drops record-specific paths while keeping their project tab", () => {
    expect(projectTabHref("/projects/min-3f2a9c81/pages/8b1e04aa", target)).toBe(
      "/projects/web-7b11c0de/pages",
    );
  });

  it("falls back to the target board outside a known project tab", () => {
    expect(projectTabHref("/projects/min-3f2a9c81", target)).toBe("/projects/web-7b11c0de");
    expect(projectTabHref("/projects/min-3f2a9c81/unknown", target)).toBe(
      "/projects/web-7b11c0de",
    );
    expect(projectTabHref("/home", target)).toBe("/projects/web-7b11c0de");
  });
});
