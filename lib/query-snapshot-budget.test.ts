import { expect, it, vi } from "vitest";
import { fitsQuerySnapshotBudget, MAX_QUERY_SNAPSHOT_BYTES } from "./query-snapshot-budget";

it("bounds escaped UTF-8 strings without serializing the input", () => {
  for (const value of ["a", '"', "\\", "\n", "\u0000", "é", "界", "😀", "\ud800", "\udc00"]) {
    const bytes = new TextEncoder().encode(JSON.stringify(value)).length;
    expect(fitsQuerySnapshotBudget(value, bytes)).toBe(true);
    expect(fitsQuerySnapshotBudget(value, bytes - 1)).toBe(false);
  }
  const stringify = vi.spyOn(JSON, "stringify");
  expect(fitsQuerySnapshotBudget("x".repeat(MAX_QUERY_SNAPSHOT_BYTES))).toBe(false);
  expect(stringify).not.toHaveBeenCalled();
  stringify.mockRestore();
});

it("counts repeated references and rejects cycles, huge sparse arrays and deep trees", () => {
  let shared: unknown = "small";
  for (let i = 0; i < 25; i++) shared = [shared, shared];
  expect(fitsQuerySnapshotBudget(shared)).toBe(false);
  const cycle: unknown[] = []; cycle.push(cycle);
  expect(fitsQuerySnapshotBudget(cycle)).toBe(false);
  expect(fitsQuerySnapshotBudget(new Array(1_000_000_000))).toBe(false);
  let deep: unknown = "leaf";
  for (let i = 0; i < 70; i++) deep = { deep };
  expect(fitsQuerySnapshotBudget(deep)).toBe(false);
});

it("accepts ordinary shared data and refuses hooks without invoking them", () => {
  const row = { id: "issue", title: "A title", absent: undefined };
  expect(fitsQuerySnapshotBudget({ rows: [row, row], count: 2, empty: null })).toBe(true);
  const getter = vi.fn(() => "x".repeat(MAX_QUERY_SNAPSHOT_BYTES));
  expect(fitsQuerySnapshotBudget(Object.defineProperty({}, "title", { enumerable: true, get: getter }))).toBe(false);
  const hook = vi.fn(() => "x".repeat(MAX_QUERY_SNAPSHOT_BYTES));
  expect(fitsQuerySnapshotBudget(Object.defineProperty({}, "toJSON", { value: hook }))).toBe(false);
  expect(getter).not.toHaveBeenCalled();
  expect(hook).not.toHaveBeenCalled();
  expect(fitsQuerySnapshotBudget(new Date())).toBe(false);
  expect(fitsQuerySnapshotBudget({ value: 1n })).toBe(false);
});
