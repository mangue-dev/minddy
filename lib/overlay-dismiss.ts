import { isVisibleOverlay } from "./visible-overlays";

// Radix portals popper content (dropdown / select / popover) OUTSIDE a Dialog or
// SidePanel's DOM. So the pointer-down that opens or dismisses a nested popper
// can read as "outside" to the overlay and close it too — closing the dropdown
// AND the whole modal/panel at once. The primitives only guard this in their drawer
// (mobile) branch; on desktop the Radix layer stacking still lets it slip
// through, so we guard `onInteractOutside` at the call sites.

const POPPER_CONTENT =
  '[data-radix-popper-content-wrapper],[data-slot="dropdown-menu-content"],[data-slot="select-content"],[data-slot="popover-content"],[role="menu"],[role="listbox"],[data-selection-toolbar],[data-mobile-editor-toolbar]';

const OPEN_POPPER =
  '[data-slot="dropdown-menu-content"][data-state="open"],[data-slot="select-content"][data-state="open"],[data-slot="popover-content"][data-state="open"],[role="menu"][data-state="open"],[role="listbox"][data-state="open"]';

// The modal overlays of components/ui. Each locks pointer events outside itself
// while open, so whatever was open before it can no longer be clicked.
const OPEN_MODAL_OVERLAY = [
  '[data-slot="dialog-content"][data-state="open"]',
  '[data-slot="side-panel-content"][data-state="open"]',
  '[data-slot="sheet-content"][data-state="open"]',
  '[data-slot="alert-dialog-content"][data-state="open"]',
].join(",");

function visibleMatches(selector: string): Element[] {
  return Array.from(document.querySelectorAll(selector)).filter(isVisibleOverlay);
}

/**
 * Radix portals each layer at the end of `body` when it opens, so a popper that
 * comes after an overlay in the document (or inside it) was opened from it and
 * stacks above it. One that comes before was already open underneath (MIN-770).
 */
function isAbove(popper: Element, overlay: Element): boolean {
  return !!(overlay.compareDocumentPosition(popper) & Node.DOCUMENT_POSITION_FOLLOWING);
}

/** Open poppers the topmost open overlay owns. Outside any overlay: all of them. */
function hasOpenPopperAboveTopOverlay(): boolean {
  const poppers = visibleMatches(OPEN_POPPER);
  const overlay = visibleMatches(OPEN_MODAL_OVERLAY).at(-1);
  return overlay ? poppers.some((popper) => isAbove(popper, overlay)) : poppers.length > 0;
}

/**
 * Guard for a Dialog/SidePanel `onInteractOutside`: keep the overlay open when
 * the outside interaction is really meant for a popper (dropdown / select /
 * popover) that lives inside it — either the interaction landed on the popper,
 * or one of its poppers is currently open (so this click is dismissing IT, not
 * the overlay). A later click, with no popper open, closes the overlay as usual.
 *
 * A popper left open UNDER the overlay doesn't count: it sits behind the
 * overlay's pointer lock and cannot be dismissed by this click, so honoring it
 * would keep both open for good.
 */
export function keepOverlayOpenForPopper(event: {
  detail: { originalEvent: Event };
  preventDefault: () => void;
}) {
  const target = event.detail.originalEvent.target;
  const onPopper = target instanceof Element && !!target.closest(POPPER_CONTENT);
  if (onPopper || hasOpenPopperAboveTopOverlay()) event.preventDefault();
}

/**
 * Last step of a modal overlay's open-autofocus. Dialogs, side panels and
 * sheets may keep focus where it was (they suppress Radix's autofocus so a
 * tooltip doesn't pop on their first button). When a shortcut or a popper's
 * own item opens one while a popper is open on the page, focus stays in that
 * popper: Radix never sees the focus leave it, so it stays open under the
 * overlay, beyond the reach of clicks (MIN-770). Moving focus to the overlay
 * itself lets the popper dismiss itself, as a pointer would have.
 */
export function releasePoppersBelow(event: Event) {
  if (!event.defaultPrevented) return; // Radix focuses the overlay itself.
  const overlay = event.currentTarget;
  if (!(overlay instanceof HTMLElement) || overlay.contains(document.activeElement)) return;
  if (!visibleMatches(OPEN_POPPER).some((popper) => !isAbove(popper, overlay))) return;
  overlay.focus({ preventScroll: true });
}

// Where a click on another layer does not close a popover: a layer opened
// above it (a nested picker, a dialog it opened) or a toast.
const LAYER = [
  POPPER_CONTENT,
  '[data-slot="dialog-content"]',
  '[data-slot="side-panel-content"]',
  '[data-slot="sheet-content"]',
  '[data-slot="alert-dialog-content"]',
  "[data-sonner-toaster]",
].join(",");

/** Is the element, or one of its ancestors, the trigger of the given id? */
function controls(element: Element, id: string): boolean {
  for (let node = element.closest("[aria-controls]"); node; node = node.parentElement?.closest("[aria-controls]") ?? null) {
    if (node.getAttribute("aria-controls") === id) return true;
  }
  return false;
}

/**
 * A popover closes on a click outside it, always (MIN-770).
 *
 * Radix defers a popover's outside-pointer dismissal to the `click` that
 * follows the `pointerdown`, and ignores focus moving out meanwhile. When that
 * click opens something on its way — a board card opening its side panel on
 * mouseup — the deferred dismissal is lost, and the popover stayed open over
 * the panel. A pointerdown stopped inside the popover (pickers stop it so a
 * card under them does not start a drag) also left Radix believing the next
 * outside press came from inside. This listener sees every click first, in
 * the capture phase, and asks `onOutside` to close the popover unless the
 * click lands in it, on its own trigger, or in a layer stacked above it.
 */
export function listenOutsideClick(content: HTMLElement, onOutside: (event: MouseEvent) => void): () => void {
  // Only a press that STARTED while the popover was open: the click ending
  // the press that opened it (a surface opening on pointerdown) is not one.
  let pressed = false;
  const onPointerDown = () => {
    pressed = true;
  };
  const onClick = (event: MouseEvent) => {
    if (!pressed) return;
    pressed = false;
    const target = event.target;
    if (!(target instanceof Element) || !target.isConnected || content.contains(target)) return;
    if (content.id && controls(target, content.id)) return;
    const layer = target.closest(LAYER);
    // A dialog holding the popover precedes it: a click elsewhere in it closes it.
    if (layer && isAbove(layer, content)) return;
    onOutside(event);
  };
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("click", onClick, true);
  return () => {
    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("click", onClick, true);
  };
}
