import type { BrowserWindow } from "electron";

import { hideWindowStep } from "@/lib/desktop/hide-window";
import { trace } from "./trace";

/**
 * Hide the window — the ONLY path (MIN-353).
 *
 * Three gestures lead there and they should behave the same: the red light
 * (`close`, intercepted in main.ts), ⌘W (menu.ts), and whatever we y
 * would add. A `window.hide()` written live somewhere is the bug of the
 * full screen which returns to that place only — that's exactly how it survived its first fix.
 *
 * The rule is in `lib/desktop/hide-window.ts`, with the reason. Here, the
 * wiring: `leave-full-screen` is the only moment when macOS has finished closing
 * the Space, therefore the only one where hiding is without side effects.
 */
export function hideWindow(window: BrowserWindow): void {
  if (window.isDestroyed()) return;

  const step = hideWindowStep({
    platform: process.platform,
    fullScreen: window.isFullScreen(),
  });
  trace("hideWindow", { step });

  if (step === "hide") {
    window.hide();
    return;
  }

  // `once`: full screen exit also happens when someone presses
  // Escape or resume the window using the Presentation menu. A subscription
  // permanent would hide the window at each of these exits.
  window.once("leave-full-screen", () => {
    // The transition lasts for the duration of an animation; ⌘Q may fall during
    // (`before-quit` destroys the window), and we don't call anything on a dead object.
    if (!window.isDestroyed()) window.hide();
  });
  window.setFullScreen(false);
}
