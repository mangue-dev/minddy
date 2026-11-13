import { describe, expect, it } from "vitest";
import { composerWraps } from "./use-composer-fold";

const card = { expanded: true, blocks: 1, multiLine: false, rowRoom: 100 };

describe("composerWraps", () => {
  it("leaves the row once the text takes a second line", () => {
    expect(composerWraps({ ...card, expanded: false, multiLine: false, lineWidth: 0 })).toBe(false);
    expect(composerWraps({ ...card, expanded: false, multiLine: true, lineWidth: 0 })).toBe(true);
  });

  it("keeps the card while the text has several blocks", () => {
    expect(composerWraps({ ...card, blocks: 2, lineWidth: 10 })).toBe(true);
  });

  it("folds back only when the line fits the row with room to spare", () => {
    expect(composerWraps({ ...card, lineWidth: 90 })).toBe(false);
    // At the edge of the row the card stays: folding there would wrap the
    // line again and switch layouts in a loop.
    expect(composerWraps({ ...card, lineWidth: 97 })).toBe(true);
    expect(composerWraps({ ...card, lineWidth: 100 })).toBe(true);
  });

  it("lets the height decide when the line has no inline content", () => {
    expect(composerWraps({ ...card, lineWidth: 0, multiLine: true })).toBe(true);
    expect(composerWraps({ ...card, lineWidth: 0, multiLine: false })).toBe(false);
  });
});
