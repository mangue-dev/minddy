import { describe, expect, it } from "vitest";
import { reorderDatabaseColumns } from "./page-database-columns";
import type { DatabaseProperty } from "./page-databases";

const schema: DatabaseProperty[] = [
  { id: "date", name: "Date", type: "date" },
  { id: "hidden", name: "Hidden", type: "text" },
  { id: "status", name: "Status", type: "select", options: [] },
  { id: "notes", name: "Notes", type: "text" },
];
const ids = (columns: DatabaseProperty[]) => columns.map((column) => column.id);

describe("database column placement", () => {
  it("moves columns before or after the target without removing hidden columns", () => {
    expect(
      ids(reorderDatabaseColumns(schema, "notes", "status", true)),
    ).toEqual(["date", "hidden", "notes", "status"]);
    expect(
      ids(reorderDatabaseColumns(schema, "date", "status", false)),
    ).toEqual(["hidden", "status", "date", "notes"]);
    expect(ids(schema)).toEqual(["date", "hidden", "status", "notes"]);
  });
  it("supports moving to either end and preserves column definitions", () => {
    const first = reorderDatabaseColumns(schema, "status", "date", true);
    expect(ids(first)).toEqual(["status", "date", "hidden", "notes"]);
    expect(first[0]).toBe(schema[2]);
    expect(ids(reorderDatabaseColumns(schema, "date", "notes", false))).toEqual(
      ["hidden", "status", "notes", "date"],
    );
  });
  it("ignores stale targets, missing columns and self drops", () => {
    for (const [moving, target] of [
      ["date", "date"],
      ["missing", "date"],
      ["date", "missing"],
    ]) {
      expect(reorderDatabaseColumns(schema, moving, target, true)).toEqual(
        schema,
      );
    }
  });
});
