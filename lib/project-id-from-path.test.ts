import { describe, expect, it } from "vitest";
import { projectIdFromPath, projectTabHref } from "./project-id-from-path";

describe("project routes", () => {
  it("extracts a project id only from project routes", () => {
    expect(projectIdFromPath("/projects/source/pages")).toBe("source");
    expect(projectIdFromPath("/home")).toBeNull();
  });

  it.each(["objectives", "pages", "triage", "feedback", "settings"])(
    "keeps the %s tab when switching projects",
    (tab) => {
      expect(projectTabHref(`/projects/source/${tab}`, "target")).toBe(
        `/projects/target/${tab}`,
      );
    },
  );

  it("drops record-specific paths while keeping their project tab", () => {
    expect(projectTabHref("/projects/source/pages/page-id", "target")).toBe(
      "/projects/target/pages",
    );
  });

  it("falls back to the target board outside a known project tab", () => {
    expect(projectTabHref("/projects/source", "target")).toBe("/projects/target");
    expect(projectTabHref("/projects/source/unknown", "target")).toBe(
      "/projects/target",
    );
    expect(projectTabHref("/home", "target")).toBe("/projects/target");
  });
});
