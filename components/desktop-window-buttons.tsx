"use client";

import {
  useAnyModalOpen,
  useHoldWindowButtons,
  useWideLayout,
  useWindowButtonsSlot,
} from "@/lib/use-window-buttons";

/**
 * Remove macOS buttons while a dialog is open (MIN-291).
 *
 * They are native: the system draws them over the web view, and **none
 * `z-index` does not exceed them**. A dialogue or a wizard therefore kept them in
 * through its corner, over the veil and the shadow - the exact opposite of this
 * that a modal tells. We cannot put them behind; we can
 * remove the time it is there, and it is coherent: during this time, the
 * window is not what we manipulate anyway.
 *
 * No rendering, and nothing at all outside of the desktop app. Mounted next to the others
 * app effects in app-providers.
 */
export function DesktopWindowButtons() {
  useHoldWindowButtons("modal", useAnyModalOpen());
  return null;
}

/**
 * The width that the buttons occupy in the top-left corner of the window:
 * from their left edge (19) to the right edge of the last pellet (65 + 14 = 79),
 * plus a margin.
 *
 * This is what `.sidebar-brand-row[data-window-buttons]` reserves in
 * app/globals.css, what the header reserves in compact mode, and what the guard
 * of the rail recognizes as "the pointer has gone to the buttons". Only one
 * digit, and it is read again with `TRAFFIC_LIGHTS` (desktop/src/main.ts).
 */
export const WINDOW_BUTTONS_WIDTH = 84;

/**
 * macOS Button Lures (MIN-291).
 *
 * Three inert pellets, drawn exactly where the system draws the
 * true, and only when these are removed for the time of a box of
 * dialogue. They are not there to deceive: they are there so that nothing
 * jump**. The real buttons are native, nothing passes in front of them, so you have to
 * remove them; but allowing their place to close would cause the mark to slide (or
 * the back button of the header) each time a dialog is opened, for an object
 * that we don't even look at. The lures, for their part, pass under the veil like the
 * rest of the app.
 *
 * **The geometry is NOTED, not deduced.** We first took the figures
 * which we give to Electron (`trafficLightPosition`) and a supposed step of 20 px:
 * false, and it showed. A system screenshot, decoded pixel by pixel,
 * says: left edge at 19, top at 22, **14 px diameter**, **23 px center to
 * center** — i.e. 9 px between two pastilles. The only number that
 * `trafficLightPosition` just gave was its origin.
 *
 * `fixed` and not `absolute`: the real buttons belong to the WINDOW, not
 * to the piece of furniture that keeps their place. This is what allows them to be rendered from the
 * sidebar or from the header without two different geometries — and this
 * which just stays on ultrawide, where the shell is a centered map while
 * the system always draws in the corner of the window.
 *
 * `z-40`, therefore UNDER the veil of dialogues (50): that's the whole goal.
 *
 * The colors are those of the system, hard: the same in light theme as
 * in dark, and they don't belong to minddy.
 *
 * `aria-hidden`: a screen reader has nothing to announce here, and especially not
 * three buttons that are not buttons.
 */
const DECOY_COLORS = ["#FF5F57", "#FEBC2E", "#28C840"];

export function WindowButtonDecoys() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-[22px] left-[19px] z-40 flex gap-[9px]"
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

/**
 * The place of the macOS buttons IN THE HEADER, under 768 px (MIN-293).
 *
 * Below this width the AppShell no longer renders the sidebars: the corner
 * top-left of the window is no longer the brand line, it's the header — and
 * the buttons fell right on the back button of the breadcrumbs, which occupies
 * the same corner. Two buttons on top of each other, one of which the page can't even
 * recevoir.
 *
 * Hence this corner guard, mounted in the compact line of Ariadne's thread: it
 * pushes the return beyond the pellets, and draws the lures when a
 * dialogue removes the real ones — the exact counterpart of what the line of
 * mark, for the screen that does not have a sidebar.
 *
 * The width removes the `px-4` from the header: this is where the line starts from.
 */
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
