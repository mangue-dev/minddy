import { describe, expect, it } from "vitest";
import {
  OBJECTIVE_BREADCRUMB_MAX_CHARACTERS,
  objectiveBreadcrumbLabel,
  objectiveIdFromBoardLocation,
} from "./objective-board-route";

describe("objectiveIdFromBoardLocation", () => {
  it("returns the objective filter on a project board", () => {
    expect(objectiveIdFromBoardLocation("/projects/project-1", "objective-1")).toBe(
      "objective-1",
    );
  });

  it("ignores the objective parameter on project subpages", () => {
    expect(
      objectiveIdFromBoardLocation(
        "/projects/project-1/objectives",
        "objective-1",
      ),
    ).toBeNull();
  });

  it("returns null when the board is not filtered by an objective", () => {
    expect(objectiveIdFromBoardLocation("/projects/project-1", null)).toBeNull();
  });
});

describe("objectiveBreadcrumbLabel", () => {
  it("keeps names of ten characters or fewer unchanged", () => {
    expect(objectiveBreadcrumbLabel("1234567890")).toBe("1234567890");
  });

  it("truncates longer names to ten visible characters including the ellipsis", () => {
    const label = objectiveBreadcrumbLabel("A long objective name");
    expect(label).toBe("A long ob…");
    expect(Array.from(label)).toHaveLength(OBJECTIVE_BREADCRUMB_MAX_CHARACTERS);
  });

  it("does not split Unicode code points", () => {
    expect(objectiveBreadcrumbLabel("🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀")).toBe(
      "🚀🚀🚀🚀🚀🚀🚀🚀🚀…",
    );
  });
});
