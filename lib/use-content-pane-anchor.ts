"use client";

import { useLayoutEffect, useState, type CSSProperties } from "react";

/** The gap a floating pill keeps above the content pane's bottom edge: the
 selection pill's `bottom-4`. */
export const CONTENT_PANE_FLOAT_GAP = 16;

/** The rounded content card: the parent of the visible `<main>`, the anchor
 the content toaster and the selection pill portal into. Retained tabs keep
 hidden `<main>` elements, which have no layout box. */
export function visibleContentPane(): HTMLElement | null {
  const main = [...document.querySelectorAll("main")].find(
    (element) => element.getClientRects().length > 0,
  );
  return main?.parentElement ?? null;
}

/**
 * Where a fixed, horizontally centered surface goes to float like the
 * selection pill: centered on the content pane, `CONTENT_PANE_FLOAT_GAP`
 * above its bottom edge, so it clears the bottom bar instead of covering it.
 * Followed while `active`, as the sidebar or the window resizes the pane,
 * and looked up again when `remeasure` changes (a surface reopened from
 * another tab finds that tab's pane); `undefined` without a pane (the
 * surface keeps its own placement).
 */
export function useContentPaneAnchor(active: boolean, remeasure?: unknown): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties>();
  useLayoutEffect(() => {
    if (!active) return;
    const pane = visibleContentPane();
    if (!pane) return;
    const place = () => {
      const rect = pane.getBoundingClientRect();
      setStyle({
        left: Math.round(rect.left + rect.width / 2),
        bottom: Math.round(window.innerHeight - rect.bottom + CONTENT_PANE_FLOAT_GAP),
      });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(pane);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [active, remeasure]);
  return active ? style : undefined;
}
