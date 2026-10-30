import { describe, expect, it } from "vitest";

import { isKeyboardOpen, keyboardInset, revealDelta } from "./mobile-keyboard";

// Values measured in iOS 27 Safari on an iPhone 18 Pro (MIN-870).
const closed = { layoutHeight: 714, viewportHeight: 714, offsetTop: 0, scale: 1 };
const pinned = { layoutHeight: 714, viewportHeight: 384, offsetTop: 0, scale: 1 };

describe("keyboardInset", () => {
  it("is 0 without a keyboard", () => {
    expect(keyboardInset(closed)).toBe(0);
    expect(isKeyboardOpen(closed)).toBe(false);
  });

  it("measures the keyboard from the layout viewport, not innerHeight", () => {
    // Safari reported innerHeight = 384 here: the former formula gave 0.
    expect(keyboardInset(pinned)).toBe(330);
    expect(isKeyboardOpen(pinned)).toBe(true);
  });

  it("subtracts the part of the keyboard already scrolled away", () => {
    expect(keyboardInset({ ...pinned, offsetTop: 45 })).toBe(285);
    expect(keyboardInset({ ...pinned, offsetTop: 330 })).toBe(0);
  });

  it("stays 0 when the browser resizes the layout itself (Android resizes-content)", () => {
    const android = { layoutHeight: 420, viewportHeight: 420, offsetTop: 0, scale: 1 };
    expect(keyboardInset(android)).toBe(0);
    expect(isKeyboardOpen(android)).toBe(false);
  });

  it("sees Chromium's keyboard against the tallest layout seen", () => {
    // resizes-content shrinks the layout with the keyboard: nothing to inset.
    const android = { layoutHeight: 420, viewportHeight: 420, offsetTop: 0, scale: 1, baselineHeight: 800 };
    expect(isKeyboardOpen(android)).toBe(true);
    expect(keyboardInset(android)).toBe(0);
  });

  it("ignores a pinch-zoomed viewport", () => {
    const zoomed = { layoutHeight: 714, viewportHeight: 357, offsetTop: 120, scale: 2 };
    expect(keyboardInset(zoomed)).toBe(0);
    expect(isKeyboardOpen(zoomed)).toBe(false);
  });

  it("does not take a settling toolbar for a keyboard", () => {
    expect(isKeyboardOpen({ ...closed, viewportHeight: 670 })).toBe(false);
  });
});

describe("revealDelta", () => {
  const area = { top: 0, bottom: 384 };

  it("leaves a visible target alone", () => {
    expect(revealDelta({ top: 100, bottom: 140 }, area)).toBe(0);
  });

  it("scrolls a target hidden under the keyboard just above it", () => {
    expect(revealDelta({ top: 500, bottom: 540 }, area)).toBe(540 - 368);
  });

  it("scrolls a target above the area back down", () => {
    expect(revealDelta({ top: -60, bottom: -20 }, area)).toBe(-76);
  });

  it("keeps the top of a target taller than the area", () => {
    expect(revealDelta({ top: 200, bottom: 900 }, area)).toBe(184);
  });
});
