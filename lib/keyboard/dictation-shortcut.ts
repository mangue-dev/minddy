import { isVisibleOverlay } from "@/lib/visible-overlays";

// Popovers also have role="dialog", but the recording popover must not take
// ownership away from the button that stops it.
const SURFACE_SELECTOR = '[role="dialog"], [role="alertdialog"]';

function isDictationSurface(element: Element): boolean {
  return !element.closest('[data-radix-popper-content-wrapper], [data-slot="popover-content"]');
}

/** Only the foremost visible dialog/panel may handle a dictation shortcut. */
export function ownsDictationShortcut(anchor: HTMLElement | null): boolean {
  if (!anchor?.isConnected) return false;
  const closestSurface = anchor.closest(SURFACE_SELECTOR);
  const surface = closestSurface && isDictationSurface(closestSurface) ? closestSurface : null;

  // hideWhenIdle deliberately hides the button; test its host instead so the
  // objective page can still start dictation while hidden retained tabs cannot.
  if (!anchor.parentElement || !isVisibleOverlay(anchor.parentElement)) return false;

  let foremost: Element | null = null;
  let foremostZIndex = -Infinity;
  for (const candidate of anchor.ownerDocument.querySelectorAll(SURFACE_SELECTOR)) {
    if (!isDictationSurface(candidate) || candidate.getAttribute("data-state") === "closed" ||
        !isVisibleOverlay(candidate)) continue;
    const zIndex = Number.parseInt(getComputedStyle(candidate).zIndex, 10) || 0;
    // Radix portals at the same z-index stack in document order.
    if (zIndex >= foremostZIndex) {
      foremost = candidate;
      foremostZIndex = zIndex;
    }
  }
  return surface === foremost;
}
