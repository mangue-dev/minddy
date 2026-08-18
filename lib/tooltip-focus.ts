/**
 * Why does a tooltip reopen by itself when you return to the tab.
 *
 * Radix opens the tooltip on the `focus` of its trigger, unconditionally
 * (`react-tooltip/dist/index.mjs` : `onFocus: … if (!isPointerDownRef.current)
 * context.onOpen()`). But the browser RETURNS focus to the element that had it
 * when the tab — or window — becomes active again: Chrome then emits a
 * `focus` that is indistinguishable from a `Tab` of the user. The tooltip
 * therefore opens on a button that no one hovered over, several minutes later
 * the last interaction. This is documented at Radix (primitives#705, closed in
 * “won't fix”: the focus comes from the browser, not from them) — the solution is
 * caller's side, here.
 *
 * Two rules, and that's it:
 *
 * 1. **Returning focus does not count.** A `focus` that just happens
 * after the window has regained control is not a gesture: it is the
 * browser that tidies up. We let it pass (the element MUST take back the
 * focus, otherwise the keyboard starts from scratch) but it doesn't open anything.
 * 2. **A focus that is not visible does not open anything.** `:focus-visible` is
 * exactly the question "does the browser believe that the user
 * navigate using the keyboard? ". A focus placed by a click, or by code which
 * returns control to a trigger by closing a popover, is not visible —
 * and a tooltip that opens there does not respond to any request.
 *
 * What it DOES NOT change: hovering, and keyboard tabulation. A real
 * `Tab` is preceded by a `keydown`, which closes the flag (see the follower
 * below) and is set to `:focus-visible`.
 */

/** The real gesture of the user, the one that says “I’m back”. */
export type TooltipFocusSignal = {
  /** The window has just regained control, without any action since. */
  refocusPending: boolean;
  /** The element carries `:focus-visible` (keyboard navigation). */
  focusVisible: boolean;
};

/** The decision, alone, without DOM: should we open the tooltip on this `focus`? */
export function shouldOpenTooltipOnFocus({
  refocusPending,
  focusVisible,
}: TooltipFocusSignal): boolean {
  return focusVisible && !refocusPending;
}

/**
 * The window return follower.
 *
 * `markRefocus()` on the `focus` of the window (or a `visibilitychange` which
 * returns visible), `markGesture()` on the first `keydown` / `pointerdown`:
 * a gesture proves that the user is controlling, and returns the focus according to its direction
 * usual. `consumeRefocus()` reads AND closes the flag — the storage of the
 * navigateur ne concerne qu'un seul `focus`.
 */
export type WindowRefocusTracker = {
  markRefocus: () => void;
  markGesture: () => void;
  consumeRefocus: () => boolean;
  readonly refocusPending: boolean;
};

export function createWindowRefocusTracker(): WindowRefocusTracker {
  let pending = false;
  return {
    markRefocus: () => {
      pending = true;
    },
    markGesture: () => {
      pending = false;
    },
    consumeRefocus: () => {
      const was = pending;
      pending = false;
      return was;
    },
    get refocusPending() {
      return pending;
    },
  };
}
