import { describe, expect, it } from "vitest";

import { layoutMarginCards, marginLayout } from "./page-comment-margin";

describe("room for threads in the page margin", () => {
  // A 900px text with a 96px gutter. Beside it: the 44px lane, a card and a
  // 24px edge.
  it("keeps the text at its gutter while the pane is too narrow to centre both", () => {
    // 480px free: 240 a side. The text gives up all but its gutter.
    expect(marginLayout(1380, 900, 96)).toEqual({ width: 304, shift: 144, text: null });
  });

  it("centres the text and its cards together in a wide pane", () => {
    // 684px free, 348 of them for the lane and a full card: 168 a side.
    const layout = marginLayout(1584, 900, 96);
    expect(layout).toEqual({ width: 304, shift: 174, text: null });
    const left = (1584 - 900) / 2 - 174;
    expect(left).toBe(1584 - (left + 900 + 44 + 304));
  });

  it("narrows the text for the smallest card when the pane cannot hold both", () => {
    // A 14-inch laptop with the sidebar open: 1178px of pane.
    const layout = marginLayout(1178, 900, 96);
    expect(layout).toEqual({ width: 240, shift: 106, text: 774 });
    // The text starts at its gutter, and the card keeps its edge.
    expect((1178 - 774) / 2 - 106).toBe(96);
    expect(96 + 774 + 44 + 240 + 24).toBe(1178);
  });

  it("keeps the badges once the text would no longer read", () => {
    expect(marginLayout(96 + 640 + 44 + 240 + 24, 900, 96)).toEqual({ width: 240, shift: 106, text: 640 });
    expect(marginLayout(96 + 640 + 44 + 240 + 24 - 1, 900, 96)).toBeNull();
  });

  it("does not narrow a text that is already narrower than the limit", () => {
    // Room beside it: it keeps its width. No room: it is not narrowed further.
    expect(marginLayout(900, 500, 64)).toEqual({ width: 268, shift: 136, text: null });
    expect(marginLayout(800, 500, 64)).toBeNull();
  });
});

describe("margin card layout", () => {
  const tops = (map: Map<string, number>) => Object.fromEntries(map);

  it("keeps each card level with its block while they do not meet", () => {
    expect(tops(layoutMarginCards([
      { id: "a", top: 0, height: 80 },
      { id: "b", top: 200, height: 80 },
    ]))).toEqual({ a: 0, b: 200 });
  });

  it("pushes a card down under the one above it, whatever order they come in", () => {
    expect(tops(layoutMarginCards([
      { id: "c", top: 120, height: 40 },
      { id: "a", top: 0, height: 100 },
      { id: "b", top: 30, height: 50 },
    ]))).toEqual({ a: 0, b: 108, c: 166 });
  });

  it("keeps the open card beside its text and moves the others around it", () => {
    expect(tops(layoutMarginCards([
      { id: "a", top: 0, height: 100 },
      { id: "b", top: 30, height: 50 },
      { id: "c", top: 60, height: 40 },
    ], "b"))).toEqual({ a: -78, b: 30, c: 88 });
  });

  it("never lifts a card above the top of the body: the open card goes down instead", () => {
    const boxes = [
      { id: "a", top: 0, height: 100 },
      { id: "b", top: 30, height: 50 },
      { id: "c", top: 60, height: 40 },
    ];
    expect(tops(layoutMarginCards(boxes, "b", 0))).toEqual({ a: 0, b: 108, c: 166 });
    // With some room above, the cards use it and the open card comes as close as it can.
    expect(tops(layoutMarginCards(boxes.map((box) => ({ ...box, top: box.top + 50 })), "c", 0)))
      .toEqual({ a: 0, b: 108, c: 166 });
    expect(tops(layoutMarginCards(boxes.map((box) => ({ ...box, top: box.top + 200 })), "c", 0)))
      .toEqual({ a: 94, b: 202, c: 260 });
  });

  it("leaves the layout alone when the open card is already in place", () => {
    const boxes = [
      { id: "a", top: 0, height: 100 },
      { id: "b", top: 30, height: 50 },
    ];
    expect(tops(layoutMarginCards(boxes, "a"))).toEqual(tops(layoutMarginCards(boxes)));
  });
});
