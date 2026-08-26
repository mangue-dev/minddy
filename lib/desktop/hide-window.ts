/**
 * Make the window disappear, including when it is in FULL SCREEN (MIN-353).
 *
 * The app only has one window, and it does not die: ⌘W and the red light
 * HIDE it, so that the app remains alive and notifications continue to arrive
 * (§3). Hiding a windowed window poses no problem.
 *
 * **Full screen is different.** macOS has given this window a *Space* of its own
 * — an entire desktop, with its entry animation and its place in Mission
 * Control. `hide()` removes the window from this Space **without closing it**:
 * an empty, black desktop remains in the foreground, with no window available
 * to leave it. The result looks like "the app went black and did not close".
 *
 * Hence the TWO-step order: we exit the full screen, which closes the Space
 * and returns the screen to what was there before, and **it's only once out**
 * that we hide. The opposite, or both in the same pass, does not work:
 * `setFullScreen(false)` is asynchronous (AppKit animates the transition), and an already hidden
 * window does not animate anything at all — it remains in its Space.
 *
 * PURE module: the rule is tested here; `desktop/src/hide-window.ts` only
 * wires it to `leave-full-screen`.
 */

/** The state of the window, reduced to what decides. */
export interface HideWindowState {
  /** `process.platform`. */
  platform: string;
  /** `window.isFullScreen()`. */
  fullScreen: boolean;
}

/** What a request to close the main window means to the desktop shell. */
export function windowCloseAction(
  quittingForUpdate: boolean
): "close" | "hide" {
  return quittingForUpdate ? "close" : "hide";
}

/**
 * The first action to take.
 *
 * - `hide` — directly, this is the ordinary case.
 * - `leave-full-screen` — exit first, hide on arrival.
 *
 * **macOS only.** Elsewhere the full screen is not a Space but a
 * window without decorations, which the window manager hides like the
 * others: adding a round trip there would not fix anything and would cause
 * the screen to flash.
 */
export function hideWindowStep(state: HideWindowState): "hide" | "leave-full-screen" {
  return state.platform === "darwin" && state.fullScreen
    ? "leave-full-screen"
    : "hide";
}
