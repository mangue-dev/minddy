"use client";

import { useWideLayout, useWindowButtonsSlot } from "@/lib/use-window-buttons";
import { WINDOW_BUTTONS_WIDTH } from "@/lib/sidebar-window-controls";

export { WINDOW_BUTTONS_WIDTH } from "@/lib/sidebar-window-controls";

/**
 * Reserve native macOS controls in the content header in mobile layout.
 *
 * The buttons stay visible whatever the page shows — dialogs, palettes and
 * drawers leave them in place, full screen is macOS's own business. In mobile
 * layout the sidebar no longer hosts them, so the header keeps their slot.
 */
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
