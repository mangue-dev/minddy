/**
 * Swipe a mobile bottom sheet down to close it, as native sheets allow.
 *
 * The sheet follows the finger once a gesture is clearly a downward drag
 * that nothing inside the sheet wants: a list scrolled away from its top
 * scrolls back first, and editors, sliders and text selections keep their
 * own gestures. On release the sheet closes when it travelled far enough or
 * was flicked, and springs back otherwise. Closing goes through the sheet's
 * own `onOpenChange`, the same path as its close button, so the guards a
 * caller puts there still apply.
 *
 * Pulled up, the sheet stretches a little and springs back, as native sheets
 * do: its top follows the finger with a growing resistance while its foot
 * stays put, past its usual ceiling by a few pixels at most. Only when
 * nothing under the finger scrolls: a list keeps the upward swipe.
 */

/** Share of the sheet's height past which a slow drag closes it. */
export const SHEET_DISMISS_DISTANCE_RATIO = 0.25;
/** Downward speed, in px/ms, that closes the sheet whatever the distance. */
export const SHEET_DISMISS_VELOCITY = 0.4;
/** A flick still has to move the sheet this far, so a tremor does not close it. */
export const SHEET_DISMISS_MIN_FLICK = 16;
/** Movement before a gesture is read as a drag rather than a tap. */
const DRAG_SLOP = 8;
const SPRING_BACK = "transform 280ms cubic-bezier(0.32, 0.72, 0, 1)";
/** The most a sheet pulled up grows by, however far the finger goes. */
export const SHEET_STRETCH_LIMIT = 40;
const STRETCH_BACK = "height 420ms cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * How much a sheet pulled up by `distance` px grows: UIScrollView's rubber
 * band, close to the finger at first, then slower and slower towards the
 * limit.
 */
export function sheetStretch(distance: number, limit = SHEET_STRETCH_LIMIT) {
  if (distance <= 0) return 0;
  return limit * (1 - 1 / ((distance * 0.55) / limit + 1));
}

/** Elements that keep their own touch gestures inside a sheet. */
const OWN_GESTURE_SELECTOR = [
  "[contenteditable]:not([contenteditable='false'])",
  "input[type='range']",
  "[role='slider']",
  "[data-sheet-no-drag]",
].join(",");

export function shouldDismissSheet({ offset, height, velocity }: { offset: number; height: number; velocity: number }) {
  if (offset <= 0) return false;
  if (offset >= height * SHEET_DISMISS_DISTANCE_RATIO) return true;
  return velocity >= SHEET_DISMISS_VELOCITY && offset >= SHEET_DISMISS_MIN_FLICK;
}

function scrolledAwayFromTop(element: Element) {
  if (element.scrollTop <= 0 || element.scrollHeight <= element.clientHeight) return false;
  const { overflowY } = getComputedStyle(element);
  return overflowY === "auto" || overflowY === "scroll";
}

/**
 * Whether a downward drag starting on `target` may move `sheet`: not from a
 * control with its own gesture, and not while something between the finger
 * and the sheet (the sheet included) can still scroll up.
 */
export function canDragSheetFrom(target: EventTarget | null, sheet: HTMLElement) {
  if (!(target instanceof Element) || !sheet.contains(target)) return false;
  if (target.closest(OWN_GESTURE_SELECTOR)) return false;
  const selection = typeof window === "undefined" ? null : window.getSelection();
  if (selection && !selection.isCollapsed && selection.rangeCount > 0 && sheet.contains(selection.anchorNode)) return false;
  for (let element: Element | null = target; element; element = element.parentElement) {
    if (scrolledAwayFromTop(element)) return false;
    if (element === sheet) break;
  }
  return true;
}

function scrolls(element: Element) {
  if (element.scrollHeight <= element.clientHeight) return false;
  const { overflowY } = getComputedStyle(element);
  return overflowY === "auto" || overflowY === "scroll";
}

/**
 * Whether an upward drag starting on `target` may stretch `sheet`: not from
 * a control with its own gesture, and not where something between the finger
 * and the sheet (the sheet included) scrolls, which keeps the swipe and its
 * own bounce.
 */
export function canStretchSheetFrom(target: EventTarget | null, sheet: HTMLElement) {
  if (!(target instanceof Element) || !sheet.contains(target)) return false;
  if (target.closest(OWN_GESTURE_SELECTOR)) return false;
  for (let element: Element | null = target; element; element = element.parentElement) {
    if (scrolls(element)) return false;
    if (element === sheet) break;
  }
  return true;
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The backdrop rendered right before the sheet in its portal. */
function overlayOf(sheet: HTMLElement): HTMLElement | null {
  const previous = sheet.previousElementSibling;
  return previous instanceof HTMLElement && previous.dataset.slot === "sheet-overlay" ? previous : null;
}

/**
 * Attach the gesture to a sheet element; returns the cleanup. `close` is
 * called once the sheet is released past the threshold.
 */
export function attachSheetSwipeDismiss(sheet: HTMLElement, close: () => void): () => void {
  let start: { x: number; y: number; time: number } | null = null;
  let dragging = false;
  // What the touch that started may do: close the sheet, stretch it, or both.
  let mayDrag = false;
  let mayStretch = false;
  // The sheet's height before a stretch, while one is drawn or settling.
  let restHeight: number | null = null;
  let stretchTimer: ReturnType<typeof setTimeout> | undefined;
  let last = { y: 0, time: 0 };
  let velocity = 0;
  let restoreTimer: ReturnType<typeof setTimeout> | undefined;

  // Grows the sheet from its top: its foot stays on the screen's edge, where
  // a translation would have lifted it off. Past its `max-height` too.
  const stretch = (amount: number) => {
    clearTimeout(stretchTimer);
    if (restHeight === null) {
      if (amount <= 0) return;
      restHeight = sheet.offsetHeight;
    }
    sheet.style.transition = "none";
    sheet.style.maxHeight = "none";
    sheet.style.height = `${restHeight + amount}px`;
  };

  const settleStretch = () => {
    if (restHeight === null) return;
    const rest = restHeight;
    const reduce = prefersReducedMotion();
    sheet.style.transition = reduce ? "none" : STRETCH_BACK;
    sheet.style.height = `${rest}px`;
    clearTimeout(stretchTimer);
    // Back at its height, the sheet sizes itself again.
    stretchTimer = setTimeout(() => {
      restHeight = null;
      sheet.style.transition = "";
      sheet.style.height = "";
      sheet.style.maxHeight = "";
    }, reduce ? 0 : 440);
  };

  const paint = (offset: number) => {
    if (offset < 0) {
      sheet.style.transform = "";
      stretch(sheetStretch(-offset));
      return;
    }
    if (restHeight !== null) stretch(0);
    sheet.style.transition = "none";
    sheet.style.transform = `translate3d(0, ${offset}px, 0)`;
    const overlay = overlayOf(sheet);
    const height = sheet.offsetHeight || 1;
    if (overlay) overlay.style.opacity = String(Math.max(0, 1 - offset / height));
  };

  const springBack = () => {
    settleStretch();
    const overlay = overlayOf(sheet);
    const transition = prefersReducedMotion() ? "none" : SPRING_BACK;
    sheet.style.transition = restHeight === null || transition === "none" ? transition : `${transition}, ${STRETCH_BACK}`;
    sheet.style.transform = "";
    if (overlay) {
      overlay.style.transition = transition === "none" ? "none" : "opacity 280ms ease";
      overlay.style.opacity = "";
    }
    clearTimeout(restoreTimer);
    // Hand the sheet's own transitions back once the spring settled.
    restoreTimer = setTimeout(() => {
      if (restHeight === null) sheet.style.transition = "";
      if (overlay) overlay.style.transition = "";
    }, 300);
  };

  const reset = () => {
    start = null;
    dragging = false;
  };

  const onTouchStart = (event: TouchEvent) => {
    reset();
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    mayDrag = canDragSheetFrom(event.target, sheet);
    mayStretch = canStretchSheetFrom(event.target, sheet);
    if (!mayDrag && !mayStretch) return;
    start = { x: touch.clientX, y: touch.clientY, time: event.timeStamp };
    last = { y: touch.clientY, time: event.timeStamp };
    velocity = 0;
  };

  const onTouchMove = (event: TouchEvent) => {
    if (!start) return;
    if (event.touches.length !== 1) {
      if (dragging) springBack();
      reset();
      return;
    }
    const touch = event.touches[0];
    const dy = touch.clientY - start.y;
    if (!dragging) {
      const dx = touch.clientX - start.x;
      if (Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return;
      // Sideways, or a way this touch may not move the sheet: a swipe or a
      // scroll that belongs to the content.
      if (Math.abs(dx) > Math.abs(dy) || (dy > 0 ? !mayDrag : !mayStretch)) {
        start = null;
        return;
      }
      dragging = true;
      // Start from the finger's position, so the sheet does not jump by the slop.
      start = { ...start, y: touch.clientY };
      clearTimeout(restoreTimer);
    }
    if (event.cancelable) event.preventDefault();
    const elapsed = event.timeStamp - last.time;
    if (elapsed > 0) velocity = (touch.clientY - last.y) / elapsed;
    last = { y: touch.clientY, time: event.timeStamp };
    const offset = touch.clientY - start.y;
    paint(mayStretch ? offset : Math.max(0, offset));
  };

  const onTouchEnd = (event: TouchEvent) => {
    if (!start || !dragging) {
      reset();
      return;
    }
    const touch = event.changedTouches[0];
    const offset = Math.max(0, (touch?.clientY ?? last.y) - start.y);
    // A finger that stopped before lifting carries no flick.
    const recent = event.timeStamp - last.time < 100 ? velocity : 0;
    reset();
    if (shouldDismissSheet({ offset, height: sheet.offsetHeight, velocity: recent })) {
      // The exit animation starts from where the finger left the sheet.
      close();
      // A caller's guard may keep the sheet open: it returns to its place.
      clearTimeout(restoreTimer);
      restoreTimer = setTimeout(() => {
        if (sheet.dataset.state !== "closed") springBack();
      }, 120);
      return;
    }
    springBack();
  };

  const onTouchCancel = () => {
    if (dragging) springBack();
    reset();
  };

  // Reopened while its exit animation played, the same element is reused:
  // it shows at its place, not where the finger let it go.
  const reopened = typeof MutationObserver === "undefined" ? null : new MutationObserver(() => {
    if (sheet.dataset.state !== "open" || !(sheet.style.transform || sheet.style.height)) return;
    clearTimeout(restoreTimer);
    clearTimeout(stretchTimer);
    restHeight = null;
    sheet.style.transition = "";
    sheet.style.transform = "";
    sheet.style.height = "";
    sheet.style.maxHeight = "";
    const overlay = overlayOf(sheet);
    if (overlay) {
      overlay.style.transition = "";
      overlay.style.opacity = "";
    }
  });
  reopened?.observe(sheet, { attributes: true, attributeFilter: ["data-state"] });

  sheet.addEventListener("touchstart", onTouchStart, { passive: true });
  // Not passive: a drag of the sheet must stop the page from scrolling.
  sheet.addEventListener("touchmove", onTouchMove, { passive: false });
  sheet.addEventListener("touchend", onTouchEnd);
  sheet.addEventListener("touchcancel", onTouchCancel);
  return () => {
    clearTimeout(restoreTimer);
    clearTimeout(stretchTimer);
    reopened?.disconnect();
    sheet.removeEventListener("touchstart", onTouchStart);
    sheet.removeEventListener("touchmove", onTouchMove);
    sheet.removeEventListener("touchend", onTouchEnd);
    sheet.removeEventListener("touchcancel", onTouchCancel);
  };
}
