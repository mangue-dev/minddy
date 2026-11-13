/**
 * The pressed state of a control under a finger, as `data-pressed`.
 *
 * `:active` is not reliable in the iOS WebView: it waits for a touch handler
 * on the element, and it is dropped as soon as a press is held, when WebKit
 * starts deciding whether the hold is a selection. A held button then showed
 * nothing at all. This marks the control from the pointer events themselves,
 * and the primitives style `data-pressed` like `:active`.
 */

const PRESSABLE = [
  "button",
  "a[href]",
  '[role="button"]',
  '[role="option"]',
  '[role="menuitem"]',
  '[role="tab"]',
  "[cmdk-item]",
  "[data-mobile-sheet-row]",
].join(",");

/** Movement past which a press is a scroll, not a press. */
const SLOP = 10;

export function trackPressState(root: Document = document): () => void {
  let pressed: Element | null = null;
  let start = { x: 0, y: 0 };

  const release = () => {
    pressed?.removeAttribute("data-pressed");
    pressed = null;
  };
  const onDown = (event: PointerEvent) => {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    release();
    const target = event.target instanceof Element ? event.target.closest(PRESSABLE) : null;
    if (!target || target.matches(":disabled, [aria-disabled='true'], [data-disabled='true']")) return;
    pressed = target;
    start = { x: event.clientX, y: event.clientY };
    target.setAttribute("data-pressed", "");
  };
  const onMove = (event: PointerEvent) => {
    if (pressed && Math.hypot(event.clientX - start.x, event.clientY - start.y) > SLOP) release();
  };

  root.addEventListener("pointerdown", onDown, { passive: true, capture: true });
  root.addEventListener("pointermove", onMove, { passive: true, capture: true });
  for (const type of ["pointerup", "pointercancel", "scroll"] as const) {
    root.addEventListener(type, release, { passive: true, capture: true });
  }
  return () => {
    release();
    root.removeEventListener("pointerdown", onDown, { capture: true });
    root.removeEventListener("pointermove", onMove, { capture: true });
    for (const type of ["pointerup", "pointercancel", "scroll"] as const) {
      root.removeEventListener(type, release, { capture: true });
    }
  };
}
