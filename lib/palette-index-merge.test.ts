import { describe, expect, it } from "vitest";
import { mergeByProject } from "./palette-index-merge";

const row = (id: string, project_id: string) => ({ id, project_id });

describe("mergeByProject", () => {
  const index = [
    row("a1", "p1"),
    row("b1", "p2"),
    row("a2", "p1"),
    row("c1", "p3"),
  ];

  it("returns the index untouched outside any project", () => {
    expect(mergeByProject(index, null, [row("x", "p1")])).toEqual(index);
  });

  it("returns the index untouched while the project's own rows are loading", () => {
    expect(mergeByProject(index, "p1", null)).toEqual(index);
    expect(mergeByProject(index, "p1", undefined)).toEqual(index);
  });

  it("puts the current project's rows first, then the other projects", () => {
    const merged = mergeByProject(index, "p1", [row("a2", "p1"), row("a1", "p1")]);
    expect(merged.map((r) => r.id)).toEqual(["a2", "a1", "b1", "c1"]);
  });

  it("surfaces a row created since the snapshot", () => {
    const merged = mergeByProject(index, "p1", [
      row("a1", "p1"),
      row("a2", "p1"),
      row("a3", "p1"),
    ]);
    expect(merged.map((r) => r.id)).toContain("a3");
  });

  it("drops a row deleted since the snapshot", () => {
    const merged = mergeByProject(index, "p1", [row("a1", "p1")]);
    expect(merged.map((r) => r.id)).toEqual(["a1", "b1", "c1"]);
  });

  it("empties only the current project when it really has no rows", () => {
    const merged = mergeByProject(index, "p1", []);
    expect(merged.map((r) => r.id)).toEqual(["b1", "c1"]);
  });

  it("never touches the other projects' rows", () => {
    const merged = mergeByProject(index, "p2", [row("b9", "p2")]);
    expect(merged.map((r) => r.id)).toEqual(["b9", "a1", "a2", "c1"]);
  });
});
