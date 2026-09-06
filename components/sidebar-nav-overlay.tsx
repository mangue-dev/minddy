"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { WINDOW_BUTTONS_WIDTH } from "@/components/desktop-window-buttons";
import { useHoldWindowButtons, useWideLayout } from "@/lib/use-window-buttons";
import { transitions } from "@/lib/motion";

/** Left-edge target that recalls hidden navigation. */
const HOTZONE = 12;

/**
 * Keep one navigation tree mounted across docked, rail, and hidden modes.
 * Animate its reserved width with the sidebars so page content resizes smoothly.
 * Hidden navigation can be recalled by pointer, keyboard focus, or a portaled layer.
 */
export function SidebarNavOverlay({
  width,
  dockedWidth,
  hidden,
  pinned = false,
  children,
}: {
  /** Expanded overlay width: primary alone, or primary plus secondary. */
  width: number;
  /** Space reserved when docked, including the primary rail when applicable. */
  dockedWidth: number;
  hidden: boolean;
  /** Keep navigation visible while one of its portaled layers is open. */
  pinned?: boolean;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const panel = useRef<HTMLDivElement | null>(null);

  const shown = !hidden || open || focusWithin || pinned;
  const flowWidth = hidden ? 0 : dockedWidth;
  const panelWidth = hidden ? width : dockedWidth;
  const shellTransition = reduce ? { duration: 0 } : transitions.shell;

  // A new visibility choice ends the previous temporary reveal. The children
  // remain mounted, preserving focus, secondary-sidebar scroll, and width motion.
  useEffect(() => {
    setOpen(false);
    setFocusWithin(false);
  }, [hidden]);

  const openPanel = useCallback(() => setOpen(true), []);
  // Without grace period: the block follows the pointer, it does not make it wait.
  // The primary rail keeps one (70 ms) because it REMAINS on the screen one
  // when folded — a touch makes it beat. This one goes away entirely;
  // the only gesture that takes him off the screen is the one that really leaves him.
  const closePanel = useCallback(() => {
    if (!pinned) setOpen(false);
  }, [pinned]);

  // The macOS buttons follow the bar that houses them: put away, they leave
  // with her. See lib/use-window-buttons.ts for what “remove” means.
  const wide = useWideLayout();
  useHoldWindowButtons("sidebar-hidden", wide && !shown);

  /**
 * What closes the block is GEOMETRY, not a `onPointerLeave`.
 *
 * The secondary bar is not rendered here: it is TELEPORTED there. And a
 * portal, in React, propagates its events along the REACT tree, not the
 * DOM — the list is indeed in the block on the screen, but it is not a
 * descending for the managers placed on it. Result: entering the
 * list did not count as staying in it, leaving it did not count as
 * leaving it, and the open block was never closed again.
 *
 * A `pointermove` on the document, compared to the rectangle of the block, does not depend on
 * of the React tree or who is mounted where. It only listens as long as the
 * block is open — when idle, it costs nothing.
 */
  useEffect(() => {
    if (!hidden || !open || pinned) return;
    const onMove = (e: PointerEvent) => {
      const el = panel.current;
      if (!el) return;
      // A menu ⋯, an account menu or a tooltip appears OUTSIDE the block
      // (Radix portal), and going over him is not leaving him: what we
      // manipulate comes from navigation and would bring it back immediately.
      const target = e.target as Element | null;
      if (target?.closest?.("[data-radix-popper-content-wrapper]")) {
        setOpen(true);
        return;
      }
      // A secondary sidebar is teleported into the panel. She is found
      // well under `panel` in the final DOM, even if React does not consider it
      // as a descendant for its events. Test this belonging
      // before the geometry prevents the filter of its high band from closing the nav
      // during a coordinate shift (especially in the desktop app).
      if (target && el.contains(target)) {
        setOpen(true);
        return;
      }
      // The area tested is that of the OPEN block, not the rectangle it occupies
      // the moment: during its entry, a pointer which goes towards the place where
      // he arrives would be “out” and would send him back immediately. It is calculated on
      // the chassis navigation box (its `offsetParent`, zero width) —
      // it is also she who ensures that everything is measured from the edge of the
      // CONTAINER, not monitor, on ultrawide.
      const box = (el.offsetParent ?? el).getBoundingClientRect();
      const inside =
        e.clientX >= box.left &&
        e.clientX <= box.left + width &&
        e.clientY >= box.top &&
        e.clientY <= box.bottom;
      setOpen(inside);
    };
    document.addEventListener("pointermove", onMove);
    // Exiting the WINDOW from the top or from the right no longer produces any
    // `pointermove`: without this the block would remain open behind another
    // tab, to reveal itself unfolded upon return.
    const onDocumentLeave = (e: PointerEvent) => {
      // macOS window buttons are native: entering them exits the DOM
      // without `pointermove` exploitable. They occupy this precise corner; keep it
      // open panel allows you to complete the gesture instead of closing it under the
      // pointer. As soon as he returns to the page, `onMove` takes over the decision.
      // Same protection when crossing the upper band of the panel: the
      // window moving grip can swallow up the next move,
      // especially if the pointer is going fast. Without this net, the navigation
      // close before the cursor even reaches its filter or controls.
      if (
        (e.clientX <= WINDOW_BUTTONS_WIDTH || e.clientX <= width) &&
        e.clientY <= 60
      ) {
        return;
      }
      closePanel();
    };
    document.documentElement.addEventListener("pointerleave", onDocumentLeave);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onDocumentLeave);
    };
  }, [hidden, open, pinned, width, closePanel]);

  // The keyboard focus, for the same reason, is listened to NATIVE on the block:
  // `focusin`/`focusout` go up the DOM, so they see the teleported bar
  // — which React's `onFocusCapture` would not do.
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    // Only the focus COMING FROM THE KEYBOARD retains the block: click a line for it
    // also gives the focus, and this is the precise moment where it must move away.
    const focusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.matches?.(":focus-visible")) setFocusWithin(true);
    };
    const focusOut = (e: FocusEvent) => {
      if (!el.contains(e.relatedTarget as Node | null)) setFocusWithin(false);
    };
    el.addEventListener("focusin", focusIn);
    el.addEventListener("focusout", focusOut);
    return () => {
      el.removeEventListener("focusin", focusIn);
      el.removeEventListener("focusout", focusOut);
    };
  }, []);

  return (
    <motion.div
      className="relative h-full shrink-0"
      data-sidebar-hidden={hidden}
      initial={{ width: flowWidth }}
      animate={{ width: flowWidth }}
      transition={shellTransition}
    >
      {/* The edge recalls hidden navigation without intercepting its controls. */}
      {hidden && (
        <div
          aria-hidden
          className={`sidebar-nav-hotzone absolute inset-y-0 left-0 ${shown ? "z-30" : "z-[41]"}`}
          style={{ width: HOTZONE }}
          onPointerEnter={openPanel}
          onPointerMove={openPanel}
        />
      )}
      <motion.div
        ref={panel}
        className="absolute inset-y-0 left-0 z-40 flex h-full overflow-hidden bg-sidebar transition-shadow duration-200 data-[floating=true]:shadow-[8px_0_32px_-8px_rgba(0,0,0,0.45)]"
        data-open={shown}
        data-floating={hidden && shown}
        initial={{ width: panelWidth, x: shown ? 0 : -width }}
        animate={{ width: panelWidth, x: shown ? 0 : -width }}
        transition={shellTransition}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
