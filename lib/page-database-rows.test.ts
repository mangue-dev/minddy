import { describe, expect, it } from "vitest";
import { databaseRowPositions, selectDatabaseRows } from "./page-database-rows";
import { buildOptimisticPage } from "./optimistic-page";

const entries = [
  { id: "a", position: "F" },
  { id: "b", position: "V" },
  { id: "c", position: "l" },
  { id: "d", position: "t" },
];
describe("database row placement and selection", () => {
  it("inserts directly above or below the target in the stored order", () => {
    for (const above of [true, false]) {
      const [position] = databaseRowPositions(entries, "b", above);
      const sorted = [...entries, { id: "new", position }]
        .sort((a, b) =>
          a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
        )
        .map((entry) => entry.id);
      expect(sorted).toEqual(
        above ? ["a", "new", "b", "c", "d"] : ["a", "b", "new", "c", "d"],
      );
    }
  });
  it("moves several entries together without using their old positions as bounds", () => {
    const positions = databaseRowPositions(entries, "d", false, ["a", "b"], 2);
    const moved = entries.map((entry, index) =>
      index < 2 ? { ...entry, position: positions[index] } : entry,
    );
    expect(
      moved
        .sort((a, b) =>
          a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
        )
        .map((entry) => entry.id),
    ).toEqual(["c", "d", "a", "b"]);
  });
  it("supports insertion at either end and rejects a missing target", () => {
    expect(
      databaseRowPositions(entries, "a", true)[0] < entries[0].position,
    ).toBe(true);
    expect(
      databaseRowPositions(entries, "d", false)[0] > entries[3].position,
    ).toBe(true);
    expect(databaseRowPositions(entries, "a", true, ["a"])).toEqual([]);
  });
  it("keeps optimistic creation at the requested adjacent position", () => {
    const [position] = databaseRowPositions(entries, "b", true);
    expect(
      buildOptimisticPage(
        "project",
        { parent_id: "db", position },
        entries.map((entry) => ({ ...entry, parent_id: "db" })),
      ).position,
    ).toBe(position);
  });
  it("extends and removes a range in displayed order", () => {
    expect(
      selectDatabaseRows(["d", "b", "a", "c"], ["d"], "a", true, "d"),
    ).toEqual(["d", "b", "a"]);
    expect(
      selectDatabaseRows(
        ["d", "b", "a", "c"],
        ["d", "b", "a"],
        "a",
        false,
        "b",
      ),
    ).toEqual(["d"]);
  });
  it("falls back to a single row when the selection anchor is filtered out", () => {
    expect(selectDatabaseRows(["b", "c"], [], "c", true, "a")).toEqual(["c"]);
  });
});
