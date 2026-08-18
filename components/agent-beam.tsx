"use client";

import { useCallback, useState, type ReactNode } from "react";
import { BorderBeam, type BorderBeamSize } from "border-beam";
import { useTheme } from "mangue-ui";

/** Settings common to both forms of the border (envelope and layer). */
const BEAM_TUNING = { duration: 4, colorVariant: "colorful" } as const;

/**
 * “Current agent” animated border (MIN-46) — the single source of agent settings
 * `BorderBeam` shared by the exit cards, the panel agent container
 * sidebar and chat/agent input during a response. `active=false` → makes the
 * children as is (no wrapper). `className` carries the RADIUS of the beam (to be aligned
 * on that of the wrapped element, e.g. `rounded-xl` / `rounded-2xl`).
 *
 * The theme is resolved by the APP (mango-ui's useTheme), not by the
 * `theme="auto"` of border-beam: its “auto” hook reads `matchMedia` in
 * its state initialization — server “dark”, first client render =
 * SYSTEM preference → the generated <style> differs and React regenerates the whole tree
 * (hydration mismatch). `resolvedTheme` is SSR-safe (same value for SSR and
 * first customer rendering, corrected post-mount) and follows the REAL theme of the app —
 * not the OS, which Minddy ignores by default (dark app).
 */
export function AgentBeam({
  active,
  className,
  size = "pulse-inner",
  keepMounted = false,
  children,
}: {
  active: boolean;
  className?: string;
  /**
   * Source preset. `pulse-inner` (default) is contained breathing
   * supermarkets — issue card, dial. On a small tablet
   * round (the FAB) it floods the disk instead of emphasizing the edge: `sm`,
   * the size preset button, makes the border run along the contour.
   */
  size?: BorderBeamSize;
  /**
   * Keeps the wrapper mounted even inactive (the border then turns on/off via
   * `active`, with its fade in). Essential as soon as children wear
   * the DOM state — a composer, for example: without that, each toggle of the border
   * moves up the tree, which loses focus AND the text being typed.
   */
  keepMounted?: boolean;
  children: ReactNode;
}) {
  const { resolvedTheme } = useTheme();
  if (!active && !keepMounted) return <>{children}</>;
  return (
    <BorderBeam
      {...BEAM_TUNING}
      active={active}
      size={size}
      theme={resolvedTheme}
      className={className}
    >
      {children}
    </BorderBeam>
  );
}

/**
 * Same border, placed as OVERPRINT in a container instead of wrapping it:
 * `absolute inset-0`, without children, `pointer-events: none`. This is the only form
 * possible on a PORTALIZED surface in `position: fixed` — the modal, the
 * side panel: the portal teleports the item out of the `AgentBeam`, which
 * then collapses to 0x0 in the page flow and no longer paints anything. To return
 * as the LAST child of the container (so it passes above the content), which
 * must be set — `fixed` for both mango-ui surfaces.
 *
 * The positioning goes through `style` and not through classes: the
 * style that `border-beam` generates (`[data-beam] { position: relative }`) is OFF
 * cascade layer, and therefore beats Tailwind utilities regardless of their order.
 *
 * The radius is MEASURED on the container rather than passed through the call site:
 * autodetection of `border-beam` reads first child, and there is none
 * here. Measuring it also follows the real container — mango-ui does not expose its
 * rays (`rounded-[2rem]` of the modal, `rounded-2xl` of the panel) nor the toggle
 * in the bottom sheet, where they change.
 */
export function AgentBeamOverlay({
  active,
  size = "pulse-inner",
}: {
  active: boolean;
  size?: BorderBeamSize;
}) {
  const { resolvedTheme } = useTheme();
  const [radius, setRadius] = useState<number>();
  // Callback ref rather than a layout effect: it only executes on commit
  // client, and therefore never in server rendering.
  const measureParent = useCallback((node: HTMLDivElement | null) => {
    // `offsetParent`, not `parentElement`: this is the element on which
    // `inset: 0` is really set, so the one whose radius must be copied. THE
    // two coincide on the side panel, but not on the bottom modal
    // sheet, where mango-ui slides a scrolling div without radius or position.
    const box = node?.offsetParent ?? node?.parentElement;
    if (!box) return;
    const r = Number.parseFloat(getComputedStyle(box).borderTopLeftRadius);
    setRadius(Number.isFinite(r) ? r : undefined);
  }, []);
  // Always mounted: this is what gives the border its EXIT fade when
  // `active` falls. When turned off, it does not paint anything (the halo is in `display: none`).
  return (
    <BorderBeam
      {...BEAM_TUNING}
      ref={measureParent}
      active={active}
      size={size}
      theme={resolvedTheme}
      borderRadius={radius}
      aria-hidden
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      {null}
    </BorderBeam>
  );
}
