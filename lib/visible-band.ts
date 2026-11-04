/** A vertical band of the window, in window coordinates. */
export interface VisibleBand {
  top: number;
  bottom: number;
}

function rootPixels(name: string): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
}

/**
 * The band of the screen the keyboard leaves. From the keyboard tokens of
 * lib/use-mobile-layout.ts when the document is pinned: they already know
 * where the keyboard is going while Safari still reports where it was. Never
 * `window.innerHeight` alone, which iOS keeps at the full height under the
 * keyboard.
 */
export function visibleBand(): VisibleBand {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  const inset = rootPixels("--mobile-keyboard-inset");
  if (!Number.isNaN(inset) && (!viewport || viewport.offsetTop === 0)) return { top: 0, bottom: root.clientHeight - inset };
  return viewport
    ? { top: viewport.offsetTop, bottom: viewport.offsetTop + viewport.height }
    : { top: 0, bottom: window.innerHeight };
}

/** The visible band, less the editor toolbar docked over the keyboard. */
export function editorMenuBand(): VisibleBand {
  const band = visibleBand();
  const strip = rootPixels("--mobile-editor-toolbar");
  return Number.isNaN(strip) ? band : { top: band.top, bottom: band.bottom - strip };
}

/**
 * Where a menu attached to the caret goes: below it when it fits or when
 * there is more room below, above it otherwise, clamped inside the band and
 * the window's width with `edge` pixels to spare.
 */
export function caretMenuPosition({ caret, width, height, band, viewportWidth, edge, gap }: {
  caret: Pick<DOMRect, "top" | "bottom" | "left">;
  width: number;
  height: number;
  band: VisibleBand;
  viewportWidth: number;
  edge: number;
  gap: number;
}): { top: number; left: number } {
  const below = band.bottom - caret.bottom - gap - edge;
  const above = caret.top - band.top - gap - edge;
  const openBelow = height <= below || below >= above;
  const top = openBelow ? caret.bottom + gap : caret.top - gap - height;
  const clamp = (value: number, min: number, max: number) =>
    Math.round(Math.min(Math.max(value, min), Math.max(min, max)));
  return {
    top: clamp(top, band.top + edge, band.bottom - height - edge),
    left: clamp(caret.left, edge, viewportWidth - width - edge),
  };
}
