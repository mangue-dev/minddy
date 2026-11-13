import { describe, expect, it } from "vitest";
import {
  PROJECT_ORDER_MAX,
  applyProjectOrder,
  moveProjectInOrder,
  resolveProjectOrder,
} from "./project-order";

const projects = ["a", "b", "c", "d"].map((id) => ({ id }));
const ids = (list: { id: string }[]) => list.map((project) => project.id);

describe("resolveProjectOrder", () => {
  it("reads the saved ids and ignores anything else", () => {
    expect(resolveProjectOrder({ project_order: ["b", 3, "a", null] })).toEqual(["b", "a"]);
    expect(resolveProjectOrder({ project_order: "b,a" })).toEqual([]);
    expect(resolveProjectOrder(undefined)).toEqual([]);
  });
});

describe("applyProjectOrder", () => {
  it("keeps the incoming order when nothing was saved", () => {
    expect(ids(applyProjectOrder(projects, []))).toEqual(["a", "b", "c", "d"]);
  });

  it("puts the saved projects first and the others after, in their order", () => {
    expect(ids(applyProjectOrder(projects, ["c", "a"]))).toEqual(["c", "a", "b", "d"]);
  });

  it("ignores ids of projects that are gone and duplicates", () => {
    expect(ids(applyProjectOrder(projects, ["gone", "d", "b", "d"]))).toEqual(["d", "b", "a", "c"]);
  });
});

describe("moveProjectInOrder", () => {
  it("moves a project down onto another's place", () => {
    expect(moveProjectInOrder(projects, [], "a", "c")).toEqual(["b", "c", "a", "d"]);
  });

  it("moves a project up from the current order", () => {
    expect(moveProjectInOrder(projects, ["d", "c", "b", "a"], "a", "c")).toEqual(["d", "a", "c", "b"]);
  });

  it("keeps the place of projects absent from the visible list", () => {
    // "b" is hidden from the sidebar: dropping "c" onto "a" leaves it second.
    expect(moveProjectInOrder(projects, [], "c", "a")).toEqual(["c", "a", "b", "d"]);
  });

  it("drops ids that no longer match a project", () => {
    expect(moveProjectInOrder(projects, ["gone", "b"], "a", "b")).toEqual(["a", "b", "c", "d"]);
  });

  it("returns null when nothing moves", () => {
    expect(moveProjectInOrder(projects, [], "a", "a")).toBeNull();
    expect(moveProjectInOrder(projects, [], "a", "missing")).toBeNull();
  });

  it("caps the saved list", () => {
    const many = Array.from({ length: PROJECT_ORDER_MAX + 5 }, (_, i) => ({ id: `p${i}` }));
    expect(moveProjectInOrder(many, [], "p1", "p0")).toHaveLength(PROJECT_ORDER_MAX);
  });
});
