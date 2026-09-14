"use client";

import {
  useAnyModalOpen,
  useHoldWindowButtons,
  useWideLayout,
  useWindowButtonsSlot,
} from "@/lib/use-window-buttons";
import { WINDOW_BUTTONS_WIDTH } from "@/lib/sidebar-window-controls";

export { WINDOW_BUTTONS_WIDTH } from "@/lib/sidebar-window-controls";

/**
 * Remove macOS buttons while a dialog is open (MIN-291).
 *
 * They are native: the system draws them over the web view, and no
 * `z-index` can rise above them. A dialog or wizard would keep them
 * through its corner, over the veil and the shadow — the opposite of what
 * a modal says. We cannot put them behind; we can remove them for the
 * time it is there, and it is consistent: during that time, the window is
 * not what we manipulate anyway. No fake substitute is drawn (MIN-545):
 * their slot stays reserved instead.
 *
 * No rendering, and nothing at all outside of the desktop app. Mounted next to the others
 * app effects in app-providers.
 */
export function DesktopWindowButtons() {
  useHoldWindowButtons("modal", useAnyModalOpen());
  return null;
}

/** Reserve native macOS controls in the content header below 768 px. */
const HEADER_PADDING_PX = 16;

export function HeaderWindowButtonsSlot() {
  const slot = useWindowButtonsSlot(!useWideLayout());
  if (!slot.reserved) return null;
  return (
    <div
      aria-hidden
      className="shrink-0"
      style={{ width: WINDOW_BUTTONS_WIDTH - HEADER_PADDING_PX }}
    />
  );
}
