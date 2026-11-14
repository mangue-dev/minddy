import { describe, expect, it } from "vitest";
import { buildPageContextBlock } from "./prompt";

describe("assistant new routine context", () => {
  it("asks for a routine on the attached project", () => {
    const block = buildPageContextBlock({ newRoutine: true, projectId: "p1" });
    expect(block).toContain("NEW routine to set up");
    expect(block).toContain("create_routine on project p1");
    expect(block).not.toContain("which project");
  });

  it("asks which project when none is attached", () => {
    const block = buildPageContextBlock({ newRoutine: true });
    expect(block).toContain("which project, when several are possible");
  });

  it("says nothing about routines without the flag", () => {
    expect(buildPageContextBlock({ projectId: "p1" })).not.toContain("create_routine");
  });
});
