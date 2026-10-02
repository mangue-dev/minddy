"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { transitions } from "@/lib/motion";

/** Left-edge target that recalls hidden navigation. */
const HOTZONE = 12;

/**
 * Keep one navigation tree mounted across docked, rail, and hidden modes.
 * The panel slides with a transform; the reserved width travels ALONG it on
 * the same shared chassis curve, so the content pane resizes live, fluidly,
 * instead of snapping when the surface lands (MIN-548 review). The panel
 * itself is absolutely positioned — nothing inside the sidebar reflows
 * during travel; only the content pane to the right follows the width.
 * Hidden navigation can be recalled by pointer, keyboard focus, or a
 * portaled layer.
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
  // Last position the page has seen of the pointer. On the macOS desktop app,
  // while the cursor is over a draggable window region the renderer receives
  // NO pointer events — crossing into one is delivered as the pointer leaving
  // the document — so the last seen position is what tells a genuine exit from
  // a slide into the drag band above the panel.
  const lastPointer = useRef<{ x: number; y: number }>({ x: Number.NaN, y: Number.NaN });

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

  // The shell-level rules key off a direct attribute instead of `:has()`.
  // A `:has()` anchored on <body> or the shell main attaches descendant-watching
  // invalidation sets to those ancestors: any style-relevant change under them
  // then re-evaluates the whole workspace, and every sidebar toggle, dialog
  // open, or scroll ran one full-document style recalculation (measured ~27.6k
  // nodes per pass). Same selectors, same specificity, no relational scan.
  // Client-side only, like the visibility preference itself: hydration paints
  // the docked snapshot, then the stored choice lands with React's resync.
  const shellHiddenAttribute = hidden ? "true" : "false";
  useEffect(() => {
    document.body.setAttribute("data-sidebar-hidden", shellHiddenAttribute);
    const shell = panel.current?.closest(".app-shell");
    shell?.setAttribute("data-sidebar-hidden", shellHiddenAttribute);
    return () => {
      document.body.removeAttribute("data-sidebar-hidden");
      shell?.removeAttribute("data-sidebar-hidden");
    };
  }, [shellHiddenAttribute]);

  // While the floating panel is actually on screen, it covers the content
  // pane's header. On macOS that header is a draggable window region, and
  // regions resolve in layout order — the header comes after this panel in
  // the DOM, so its `drag` rect wins over the overlap and the panel's top
  // controls stay visible but inert. The attribute lets the stylesheet retire
  // the header's drag region for exactly the time the panel overlaps it.
  const floating = hidden && shown;
  useEffect(() => {
    if (!floating) return;
    document.body.setAttribute("data-sidebar-floating", "true");
    return () => {
      document.body.removeAttribute("data-sidebar-floating");
    };
  }, [floating]);

  const openPanel = useCallback((e?: { clientX: number; clientY: number }) => {
    if (e) {
      lastPointer.current = { x: e.clientX, y: e.clientY };
    }
    setOpen(true);
  }, []);
  // Without grace period: the block follows the pointer, it does not make it wait.
  // The primary rail keeps one (70 ms) because it REMAINS on the screen one
  // when folded — a touch makes it beat. This one goes away entirely;
  // the only gesture that takes him off the screen is the one that really leaves him.
  const closePanel = useCallback(() => {
    if (!pinned) setOpen(false);
  }, [pinned]);

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
    /** Is this page position over the OPEN panel's box? Shared by the
        geometry rule and the leave handler below. */
    const insidePanelBox = (x: number, y: number): boolean => {
      const el = panel.current;
      if (!el) return false;
      // The area tested is that of the OPEN block, not the rectangle it occupies
      // the moment: during its entry, a pointer which goes towards the place where
      // he arrives would be “out” and would send him back immediately. It is calculated on
      // the chassis navigation box (its `offsetParent`, zero width) —
      // it is also she who ensures that everything is measured from the edge of the
      // CONTAINER, not monitor, on ultrawide.
      const box = (el.offsetParent ?? el).getBoundingClientRect();
      return (
        x >= box.left &&
        x <= box.left + width &&
        y >= box.top &&
        y <= box.bottom
      );
    };
    const onMove = (e: PointerEvent) => {
      lastPointer.current = { x: e.clientX, y: e.clientY };
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
      setOpen(insidePanelBox(e.clientX, e.clientY));
    };
    document.addEventListener("pointermove", onMove);
    // Exiting the WINDOW from the top or from the right no longer produces any
    // `pointermove`: without this the block would remain open behind another
    // tab, to reveal itself unfolded upon return.
    //
    // On the macOS desktop app this event ALSO fires when the pointer slides
    // into a `-webkit-app-region: drag` rect — the top bar above the panel,
    // the content header it overlaps — because macOS claims the cursor before
    // the page sees anything. Closing then shut the floating sidebar the
    // moment it reached the top band, and hovering it became impossible. So
    // only a leave whose last seen position was ALREADY outside the panel is
    // a genuine exit; otherwise the next real `pointermove` re-evaluates the
    // geometry and closes by the rule above.
    const onDocumentLeave = () => {
      const { x, y } = lastPointer.current;
      if (Number.isFinite(x) && insidePanelBox(x, y)) return;
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
    <div
      className="relative h-full shrink-0 [transition:width_180ms_cubic-bezier(0.32,0.72,0,1)] motion-reduce:[transition:none]"
      data-sidebar-hidden={hidden}
      style={{ width: flowWidth }}
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
        // z-[38], UNDER the app top bar (z-40) but OVER the content pane header
        // (z-[35]): that header must stay above the board's own sticky column
        // headers (z-30) when the pane scrolls, and the floating panel must
        // cover it when navigation is recalled — a panel sliding under it read
        // as a slice of content riding above the sidebar. The closed state's
        // hotzone stays at z-[41], above the bar, so the top-left corner still
        // recalls navigation.
        className="sidebar-nav-panel absolute inset-y-0 left-0 z-[38] flex h-full overflow-hidden rounded-r-[var(--app-pane-radius)] bg-sidebar transition-shadow duration-200 data-[floating=false]:rounded-r-none data-[floating=true]:shadow-[16px_0_40px_-24px_rgba(0,0,0,0.35)]"
        data-open={shown}
        data-floating={hidden && shown}
        style={{ width: panelWidth }}
        initial={{ x: shown ? 0 : -width }}
        animate={{ x: shown ? 0 : -width }}
        transition={shellTransition}
      >
        {children}
      </motion.div>
    </div>
  );
}
