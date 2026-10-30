/**
 * Software keyboard geometry (MIN-870).
 *
 * Fixed elements are laid out in the layout viewport; the keyboard only
 * shrinks the visual viewport. What a bottom sheet must clear is the part of
 * the layout viewport below the visible area.
 *
 * The layout height comes from `document.documentElement.clientHeight`, not
 * `window.innerHeight`: iOS Safari now shrinks `innerHeight` with the keyboard
 * (714 → 384 on an iPhone 18 Pro), so `innerHeight - visualViewport.height`
 * is always 0 there, and every sheet stayed under the keyboard.
 */
export type ViewportSample = {
  /** `document.documentElement.clientHeight` */
  layoutHeight: number;
  /** `visualViewport.height` */
  viewportHeight: number;
  /** `visualViewport.offsetTop` */
  offsetTop: number;
  /** `visualViewport.scale`; pinch zoom pans the visual viewport too. */
  scale: number;
  /**
   * The tallest layout height seen at this width. Chromium resizes the layout
   * with the keyboard (`resizes-content`): against the layout, its keyboard
   * is invisible; against this baseline, it shows.
   */
  baselineHeight?: number;
};

/** Below this, a difference is browser chrome settling, not a keyboard. */
const KEYBOARD_MIN_HEIGHT = 80;

export function keyboardInset({ layoutHeight, viewportHeight, offsetTop, scale }: ViewportSample) {
  // A zoomed page shrinks the visual viewport without any keyboard.
  if (scale > 1.01) return 0;
  return Math.max(0, Math.round(layoutHeight - viewportHeight - offsetTop));
}

export function isKeyboardOpen(sample: ViewportSample) {
  if (sample.scale > 1.01) return false;
  return Math.max(sample.layoutHeight, sample.baselineHeight ?? 0) - sample.viewportHeight >= KEYBOARD_MIN_HEIGHT;
}

/**
 * Scroll needed to bring a target band inside a visible band, with a margin,
 * like `scrollIntoView({ block: "nearest" })`: 0 when it already fits, the
 * top wins when the target is taller than the area.
 */
export function revealDelta(target: { top: number; bottom: number }, area: { top: number; bottom: number }, margin = 16) {
  const top = area.top + margin;
  const bottom = area.bottom - margin;
  if (target.top < top) return target.top - top;
  if (target.bottom > bottom) return Math.min(target.bottom - bottom, target.top - top);
  return 0;
}
