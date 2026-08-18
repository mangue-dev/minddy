import { describe, expect, it } from "vitest";
import { defaultAgentProjectId } from "./last-agent-project";

const projects = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("defaultAgentProjectId", () => {
  it("prefers the last project an agent was launched in", () => {
    expect(defaultAgentProjectId(projects, "c")).toBe("c");
  });

  it("falls back to the first project when nothing was launched yet", () => {
    // The list arrives sorted by `updated_at`: the first is the affected project
    // most recently, not an arbitrary sort prime.
    expect(defaultAgentProjectId(projects, null)).toBe("a");
  });

  it("falls back when the remembered project is gone", () => {
    // The id lives in the browser: the project could have been deleted, access
    // lost, or another account be connected on the same machine.
    expect(defaultAgentProjectId(projects, "deleted")).toBe("a");
  });

  it("returns null when the user has no project at all", () => {
    expect(defaultAgentProjectId([], "a")).toBeNull();
  });
});
