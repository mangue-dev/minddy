// The “->” → “→” substitution for plain text fields (the page title).
//
// The contract mirrors components/editor-arrows.ts: the rule fires on the
// closing “>”, walks back to the whole arrow, and `-->` stays a SINGLE arrow
// while `<->` and `<-->` become the double one. A lone “<-” is left alone.

import { describe, expect, it } from "vitest";
import { applyArrowRule } from "@/lib/arrow-input";

describe("applyArrowRule", () => {
  it("replaces a simple arrow before the caret", () => {
    expect(applyArrowRule("step 1 ->", 9)).toEqual({
      text: "step 1 →",
      caret: 8,
    });
  });

  it("keeps a double dash a single arrow", () => {
    expect(applyArrowRule("a --", 4)).toBeNull();
    expect(applyArrowRule("a -->", 5)).toEqual({ text: "a →", caret: 3 });
  });

  it("replaces a double arrow when it opens with <", () => {
    expect(applyArrowRule("a <->", 5)).toEqual({ text: "a ↔", caret: 3 });
    expect(applyArrowRule("a <-->", 6)).toEqual({ text: "a ↔", caret: 3 });
  });

  it("leaves a lone closing sequence alone", () => {
    expect(applyArrowRule("a -", 2)).toBeNull();
    expect(applyArrowRule("a <-", 4)).toBeNull();
  });

  it("keeps the caret after the arrow and preserves the tail", () => {
    expect(applyArrowRule("a ->b", 4)).toEqual({ text: "a →b", caret: 3 });
    expect(applyArrowRule("a <->b", 5)).toEqual({ text: "a ↔b", caret: 3 });
  });

  it("only reads up to the caret", () => {
    expect(applyArrowRule("a -> then", 4)).toEqual({
      text: "a → then",
      caret: 3,
    });
  });
});
