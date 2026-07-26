import { describe, expect, it } from "vitest";
import { MAX_PROJECT_CHANNELS, projectTopicIds } from "./realtime-topics";

/** Minimal project shape: only the fields the selection reads. */
const project = (id: string, updated_at: string, deleted_at: string | null = null) => ({
  id,
  updated_at,
  deleted_at,
});

/** N projects, oldest first, so p0 is the coldest and p{n-1} the hottest. */
const many = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    project(`p${i}`, `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`)
  );

describe("projectTopicIds", () => {
  it("returns nothing without projects", () => {
    expect(projectTopicIds(undefined, null)).toEqual([]);
    expect(projectTopicIds([], null)).toEqual([]);
  });

  it("orders by most recently touched", () => {
    const projects = [
      project("cold", "2026-01-01T00:00:00Z"),
      project("hot", "2026-03-01T00:00:00Z"),
      project("warm", "2026-02-01T00:00:00Z"),
    ];
    expect(projectTopicIds(projects, null)).toEqual(["hot", "warm", "cold"]);
  });

  it("skips soft-deleted projects — their topic never emits", () => {
    const projects = [
      project("live", "2026-01-02T00:00:00Z"),
      project("gone", "2026-01-03T00:00:00Z", "2026-01-04T00:00:00Z"),
    ];
    expect(projectTopicIds(projects, null)).toEqual(["live"]);
  });

  it("caps the number of channels", () => {
    const ids = projectTopicIds(many(MAX_PROJECT_CHANNELS + 10), null);
    expect(ids).toHaveLength(MAX_PROJECT_CHANNELS);
    // The hottest survive, the coldest are dropped.
    expect(ids[0]).toBe(`p${MAX_PROJECT_CHANNELS + 9}`);
    expect(ids).not.toContain("p0");
  });

  it("keeps the project on screen even when it falls outside the cap", () => {
    const projects = many(MAX_PROJECT_CHANNELS + 10);
    const ids = projectTopicIds(projects, "p0"); // p0 is the coldest of all
    expect(ids).toHaveLength(MAX_PROJECT_CHANNELS);
    expect(ids[0]).toBe("p0");
    // It evicted the coldest of the survivors, not one more than needed.
    expect(ids).not.toContain(`p${10}`);
  });

  it("does not duplicate the project on screen when it is already in the cap", () => {
    const projects = many(3);
    const ids = projectTopicIds(projects, "p2");
    expect(ids).toEqual(["p2", "p1", "p0"]);
  });

  it("tolerates an active project that is not in my list yet", () => {
    // A freshly-created project the ["projects"] cache hasn't picked up.
    expect(projectTopicIds([], "brand-new")).toEqual(["brand-new"]);
  });
});
