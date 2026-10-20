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
 * Three rules, and that's it:
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
 * 3. **Only a key that moves focus opens on focus** (MIN-724). Tab, the
 * arrows, Home and End move focus from one control to the next; Enter, Space
 * or a shortcut that opens a dialog does not, and the focus that dialog then
 * places on its first control (often a close button) is code, even though
 * the browser marks it `:focus-visible` after a key press. A tooltip opening
 * there covers the title and swallows the first Escape.
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
  /** The last gesture was a key that moves focus (Tab, arrows, Home, End). */
  navigationKey: boolean;
};

const NAVIGATION_KEYS = new Set([
  "Tab",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
]);

/** Whether a `keydown` with this `key` moves focus between controls. */
export function isFocusNavigationKey(key: string): boolean {
  return NAVIGATION_KEYS.has(key);
}

/** The decision, alone, without DOM: should we open the tooltip on this `focus`? */
export function shouldOpenTooltipOnFocus({
  refocusPending,
  focusVisible,
  navigationKey,
}: TooltipFocusSignal): boolean {
  return focusVisible && !refocusPending && navigationKey;
}

/**
 * The window return follower.
 *
 * `markRefocus()` on the `focus` of the window (or a `visibilitychange` which
 * returns visible), `markGesture()` on the first `keydown` / `pointerdown`:
 * a gesture proves that the user is in control again, and focus follows its
 * usual rules. `consumeRefocus()` reads AND clears the flag: the browser's
 * restoration concerns a single `focus`. `navigating` remembers whether that
 * gesture was a focus-moving key.
 */
export type WindowRefocusTracker = {
  markRefocus: () => void;
  /** `navigation`: the gesture is a key that moves focus. */
  markGesture: (navigation?: boolean) => void;
  consumeRefocus: () => boolean;
  readonly refocusPending: boolean;
  /** The latest gesture was a focus-moving key. */
  readonly navigating: boolean;
};

export function createWindowRefocusTracker(): WindowRefocusTracker {
  let pending = false;
  let navigating = false;
  return {
    markRefocus: () => {
      pending = true;
    },
    markGesture: (navigation = false) => {
      pending = false;
      navigating = navigation;
    },
    consumeRefocus: () => {
      const was = pending;
      pending = false;
      return was;
    },
    get refocusPending() {
      return pending;
    },
    get navigating() {
      return navigating;
    },
  };
}
