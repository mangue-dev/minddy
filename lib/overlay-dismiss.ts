// Radix portals popper content (dropdown / select / popover) OUTSIDE a Dialog or
// SidePanel's DOM. So the pointer-down that opens or dismisses a nested popper
// can read as "outside" to the overlay and close it too — closing the dropdown
// AND the whole modal/panel at once. mangue-ui only guards this in its drawer
// (mobile) branch; on desktop the Radix layer stacking still lets it slip
// through, so we guard `onInteractOutside` at the call sites.

const POPPER_CONTENT =
  '[data-radix-popper-content-wrapper],[data-slot="dropdown-menu-content"],[data-slot="select-content"],[data-slot="popover-content"],[role="menu"],[role="listbox"]';

const OPEN_POPPER =
  '[data-slot="dropdown-menu-content"][data-state="open"],[data-slot="select-content"][data-state="open"],[data-slot="popover-content"][data-state="open"],[role="menu"][data-state="open"],[role="listbox"][data-state="open"]';

/**
 * Guard for a Dialog/SidePanel `onInteractOutside`: keep the overlay open when
 * the outside interaction is really meant for a popper (dropdown / select /
 * popover) that lives inside it — either the interaction landed on the popper,
 * or a popper is currently open (so this click is dismissing IT, not the
 * overlay). A later click, with no popper open, closes the overlay as usual.
 */
export function keepOverlayOpenForPopper(event: {
  detail: { originalEvent: Event };
  preventDefault: () => void;
}) {
  const target = event.detail.originalEvent.target;
  const onPopper = target instanceof Element && !!target.closest(POPPER_CONTENT);
  const popperOpen =
    typeof document !== "undefined" && !!document.querySelector(OPEN_POPPER);
  if (onPopper || popperOpen) event.preventDefault();
}
