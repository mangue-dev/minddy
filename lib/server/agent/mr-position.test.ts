import { describe, expect, it } from "vitest";
import { resolveDiffPosition } from "./mr-position";

/**
 * Tests of GitLab position resolution (MIN-69): an added line yields
 * `new_line` alone, a deleted line `old_line` alone, a context line BOTH, and
 * a line outside the diff yields null (422 from the API, "lineNotInDiff" in the UI).
 */

// Simple hunk: base lines 10-14, one deletion (11), one insertion (12).
const DIFF = [
  "@@ -10,5 +10,5 @@ function demo() {",
  " context-a", // old 10 / new 10
  "-removed", // old 11
  "+added", // new 11
  " context-b", // old 12 / new 12
  " context-c", // old 13 / new 13
  " context-d", // old 14 / new 14
  "",
].join("\n");

describe("resolveDiffPosition", () => {
  it("added line (RIGHT) → new_line only", () => {
    expect(resolveDiffPosition(DIFF, 11, "RIGHT")).toEqual({ oldLine: null, newLine: 11 });
  });

  it("deleted line (LEFT) → old_line only", () => {
    expect(resolveDiffPosition(DIFF, 11, "LEFT")).toEqual({ oldLine: 11, newLine: null });
  });

  it("context line → both numbers, offset tracked after +/-", () => {
    // context-b: old 12 / new 12 (the -/+ cancel out), same on RIGHT and LEFT.
    expect(resolveDiffPosition(DIFF, 12, "RIGHT")).toEqual({ oldLine: 12, newLine: 12 });
    expect(resolveDiffPosition(DIFF, 12, "LEFT")).toEqual({ oldLine: 12, newLine: 12 });
  });

  it("tracks the offset when additions and deletions do not balance", () => {
    const diff = [
      "@@ -5,3 +5,4 @@",
      " ctx", // old 5 / new 5
      "+first", // new 6
      "+second", // new 7
      "-gone", // old 6
      " tail", // old 7 / new 8
      "",
    ].join("\n");
    expect(resolveDiffPosition(diff, 7, "RIGHT")).toEqual({ oldLine: null, newLine: 7 });
    expect(resolveDiffPosition(diff, 6, "LEFT")).toEqual({ oldLine: 6, newLine: null });
    expect(resolveDiffPosition(diff, 8, "RIGHT")).toEqual({ oldLine: 7, newLine: 8 });
  });

  it("multiple hunks: counters reset at each @@ header", () => {
    const diff = [
      "@@ -1,2 +1,2 @@",
      " a", // old 1 / new 1
      "+b", // new 2
      "-c", // old 2
      "@@ -40,2 +40,2 @@",
      " x", // old 40 / new 40
      "+y", // new 41
      "-z", // old 41
      "",
    ].join("\n");
    expect(resolveDiffPosition(diff, 41, "RIGHT")).toEqual({ oldLine: null, newLine: 41 });
    expect(resolveDiffPosition(diff, 41, "LEFT")).toEqual({ oldLine: 41, newLine: null });
  });

  it("line outside the diff → null (never an invented position)", () => {
    expect(resolveDiffPosition(DIFF, 9, "RIGHT")).toBeNull();
    expect(resolveDiffPosition(DIFF, 15, "RIGHT")).toBeNull();
    expect(resolveDiffPosition(DIFF, 999, "LEFT")).toBeNull();
  });

  it("ignores the \"no newline\" marker and the trailing empty split entry", () => {
    const diff = [
      "@@ -1,2 +1,2 @@",
      " keep", // old 1 / new 1
      "-old-end", // old 2
      "\\ No newline at end of file",
      "+new-end", // new 2
      "\\ No newline at end of file",
      "",
    ].join("\n");
    expect(resolveDiffPosition(diff, 2, "RIGHT")).toEqual({ oldLine: null, newLine: 2 });
    // Line 3 does not exist anywhere: the final "" must not count as context.
    expect(resolveDiffPosition(diff, 3, "RIGHT")).toBeNull();
  });
});
