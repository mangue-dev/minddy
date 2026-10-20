import { describe, expect, it } from "vitest";

import {
  createWindowRefocusTracker,
  isFocusNavigationKey,
  shouldOpenTooltipOnFocus,
} from "@/lib/tooltip-focus";

/**
 * The defects, as experienced: leave the minddy tab and come back, and a
 * tooltip is open on a button nobody hovered; open a dialog from the keyboard,
 * and the tooltip of its close button covers the title. The tests replay the
 * SEQUENCE of events that leads there, not Radix itself: the decision is ours.
 */

const keyboard = { refocusPending: false, focusVisible: true, navigationKey: true };

describe("shouldOpenTooltipOnFocus", () => {
  it("opens on an ordinary keyboard focus", () => {
    expect(shouldOpenTooltipOnFocus(keyboard)).toBe(true);
  });

  it("does not open on the focus the browser restores when the tab returns", () => {
    expect(shouldOpenTooltipOnFocus({ ...keyboard, refocusPending: true })).toBe(false);
  });

  it("does not open on a focus that is not visible (click, focus placed by code)", () => {
    expect(shouldOpenTooltipOnFocus({ ...keyboard, focusVisible: false })).toBe(false);
  });

  it("does not open on the focus a dialog places after Enter or a shortcut", () => {
    expect(shouldOpenTooltipOnFocus({ ...keyboard, navigationKey: false })).toBe(false);
  });
});

describe("isFocusNavigationKey", () => {
  it("recognizes the keys that move focus between controls", () => {
    for (const key of ["Tab", "ArrowDown", "ArrowRight", "Home", "End"]) {
      expect(isFocusNavigationKey(key)).toBe(true);
    }
  });

  it("ignores keys that act instead of moving", () => {
    for (const key of ["Enter", " ", "Escape", "k", "Meta"]) {
      expect(isFocusNavigationKey(key)).toBe(false);
    }
  });
});

describe("createWindowRefocusTracker", () => {
  it("holds the focus restored when the window returns, once", () => {
    const tracker = createWindowRefocusTracker();
    tracker.markRefocus();
    expect(tracker.consumeRefocus()).toBe(true);
    // The browser's restoration concerns one focus only: the next one is a
    // real gesture and opens normally.
    expect(tracker.consumeRefocus()).toBe(false);
  });

  it("lets a Tab that follows the tab return through", () => {
    const tracker = createWindowRefocusTracker();
    tracker.markRefocus();
    // A `keydown` always precedes the focus it causes.
    tracker.markGesture(true);
    expect(tracker.consumeRefocus()).toBe(false);
    expect(tracker.navigating).toBe(true);
  });

  it("lets a click that follows the tab return through, without navigating", () => {
    const tracker = createWindowRefocusTracker();
    tracker.markRefocus();
    tracker.markGesture();
    expect(tracker.refocusPending).toBe(false);
    expect(tracker.navigating).toBe(false);
  });

  it("starts closed: outside a window return, nothing is held", () => {
    const tracker = createWindowRefocusTracker();
    expect(tracker.refocusPending).toBe(false);
    expect(tracker.consumeRefocus()).toBe(false);
    expect(tracker.navigating).toBe(false);
  });

  it("replays the full defect: tab return, then the restored focus", () => {
    const tracker = createWindowRefocusTracker();
    // The last gesture was a Tab, the tab leaves, then comes back.
    tracker.markGesture(true);
    tracker.markRefocus();
    const signal = () => ({
      refocusPending: tracker.consumeRefocus(),
      focusVisible: true,
      navigationKey: tracker.navigating,
    });
    expect(shouldOpenTooltipOnFocus(signal())).toBe(false);
    // The next keyboard focus opens again.
    expect(shouldOpenTooltipOnFocus(signal())).toBe(true);
  });

  it("replays a dialog opened with Enter: its initial focus opens nothing", () => {
    const tracker = createWindowRefocusTracker();
    tracker.markGesture(false);
    expect(
      shouldOpenTooltipOnFocus({
        refocusPending: tracker.consumeRefocus(),
        focusVisible: true,
        navigationKey: tracker.navigating,
      }),
    ).toBe(false);
  });
});
