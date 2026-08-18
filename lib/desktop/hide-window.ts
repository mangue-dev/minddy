/**
 * Make the window disappear, when it is in FULL SCREEN (MIN-353).
 *
 * The app only has one window, and it does not die: ⌘W and the red light la
 * HIDE, so that the app remains alive and the notifications continue
 * to arrive (§3). Hiding a windowed window poses no problem.
 *
 * **Full screen, yes.** macOS has given this window a *Space* of its own — an entire
 * desktop, with its entry animation and its place in Mission Control.
 * `hide()` removes the window from this Space **without close it**: there remains an empty, black desk in the foreground, and there is nothing left in it to get out of. What we then see is "the app went black and did not close" — both halves of the symptom, and they say the same thing.
 *
 * Hence the TWO-step order: we exit the full screen, which closes the Space
 * and returns the screen to what was there before, and **it's only once out**
 * that we hide. The opposite, or both in the same pass, does not work:
 * `setFullScreen(false)` is asynchronous (AppKit animates the transition), and an already hidden
 * window does not animate anything at all — it remains in its Space.
 *
 * PUR module: the rule is tested here, `desktop/src/hide-window.ts` just
 * wires it to `leave-full-screen`.
 */

/** The state of the window, reduced to what decides. */
export interface HideWindowState {
  /** `process.platform`. */
  platform: string;
  /** `window.isFullScreen()`. */
  fullScreen: boolean;
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
