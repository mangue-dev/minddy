"use client";

import {
  useAnyModalOpen,
  useHoldWindowButtons,
  useWideLayout,
  useWindowButtonsSlot,
} from "@/lib/use-window-buttons";
import { WINDOW_BUTTONS_WIDTH } from "@/lib/sidebar-window-controls";

export { WINDOW_BUTTONS_WIDTH } from "@/lib/sidebar-window-controls";

/** Native macOS controls must yield to modal dialogs drawn by the renderer. */
export function DesktopWindowButtons() {
  useHoldWindowButtons("modal", useAnyModalOpen());
  return null;
}

/**
 * Inert placeholders keep the native slot stable while a modal hides the real
 * controls. Their 14 px diameter and 23 px center spacing follow the existing
 * native geometry; the 15 px top offset centers them in the 44 px bar.
 * Fixed positioning matches the window coordinate system. Dialogs cover these
 * placeholders, unlike the native controls themselves.
 */
const DECOY_COLORS = ["#FF5F57", "#FEBC2E", "#28C840"];

export function WindowButtonDecoys() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-[15px] left-[19px] z-40 flex gap-[9px]"
    >
      {DECOY_COLORS.map((color) => (
        <span
          key={color}
          className="size-3.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

/** Reserve native macOS controls in the content header below 768 px. */
const HEADER_PADDING_PX = 16;

export function HeaderWindowButtonsSlot() {
  const slot = useWindowButtonsSlot(!useWideLayout());
  if (!slot.reserved) return null;
  return (
    <>
      {slot.decoy && <WindowButtonDecoys />}
      <div
        aria-hidden
        className="shrink-0"
        style={{ width: WINDOW_BUTTONS_WIDTH - HEADER_PADDING_PX }}
      />
    </>
  );
}
