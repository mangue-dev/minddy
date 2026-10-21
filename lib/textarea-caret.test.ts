import { describe, expect, it } from "vitest";
import { isOnLastLine, nearestOnLastLine, type CaretPoint } from "@/lib/textarea-caret";

// "abc de" folded after "abc ": two lines 20px apart, 10px per character.
const folded: CaretPoint[] = [
  { left: 0, top: 0 },
  { left: 10, top: 0 },
  { left: 20, top: 0 },
  { left: 30, top: 0 },
  { left: 0, top: 20 },
  { left: 10, top: 20 },
  { left: 20, top: 20 },
];

describe("isOnLastLine", () => {
  it("tells the folded last line from the first", () => {
    expect(isOnLastLine(folded, 1, 10)).toBe(false);
    expect(isOnLastLine(folded, 4, 10)).toBe(true);
    expect(isOnLastLine(folded, 6, 10)).toBe(true);
  });

  it("puts every position of a one-line field on its last line", () => {
    expect(isOnLastLine(folded.slice(0, 4), 0, 10)).toBe(true);
  });
});

describe("nearestOnLastLine", () => {
  it("keeps the x the caret had in the description", () => {
    expect(nearestOnLastLine(folded, 12, 10)).toBe(5);
  });

  it("stops at the end of a short last line", () => {
    expect(nearestOnLastLine(folded, 300, 10)).toBe(6);
  });

  it("never picks a position of an upper line", () => {
    expect(nearestOnLastLine(folded, 30, 10)).toBe(6);
  });
});
