import { describe, expect, it } from "vitest";
import { defaultCreateProjectId } from "./last-create-project";

const projects = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("defaultCreateProjectId", () => {
  it("prefers the last project a ticket was created in", () => {
    expect(defaultCreateProjectId(projects, "c")).toBe("c");
  });

  it("falls back to the first project when nothing was created yet", () => {
    expect(defaultCreateProjectId(projects, null)).toBe("a");
  });

  it("falls back when the remembered project is gone", () => {
    // The id lives in the browser: the project may have been deleted, access
    // lost, or another account may be signed in on the same machine.
    expect(defaultCreateProjectId(projects, "deleted")).toBe("a");
  });

  it("returns null when the user has no project at all", () => {
    expect(defaultCreateProjectId([], "a")).toBeNull();
  });
});
