// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { boardRowHeight, boardWindowRange, registerBoardRowHeights } from "./board-windowing";

describe("board window interaction ownership", () => {
  it("keeps visible, focused and distant drag targets in source order", () => {
    const keys = Array.from({ length: 100 }, (_, index) => String(index));
    expect(boardWindowRange([8, 9, 10], keys, new Set(["9", "70", "gone"])) )
      .toEqual([8, 9, 10, 70]);
  });

  it("isolates geometry by column and preserves a replacement registration", () => {
    const first = document.createElement("div"), second = document.createElement("div");
    const dispose = registerBoardRowHeights(first, (id) => id === "card" ? 300 : null);
    expect(boardRowHeight(first, "card")).toBe(300);
    expect(boardRowHeight(second, "card")).toBeNull();
    expect(boardRowHeight(first, "other")).toBeNull();
    const disposeReplacement = registerBoardRowHeights(first, () => 100);
    dispose();
    expect(boardRowHeight(first, "card")).toBe(100);
    disposeReplacement();
    expect(boardRowHeight(first, "card")).toBeNull();
  });
});
