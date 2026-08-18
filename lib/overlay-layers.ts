/**
 * The CARRIED layers, and the two questions that a "home" panel must ask them
 * (MIN-284).
 *
 * A panel that closes on external clicking decides this by looking if the target
 * is in its own DOM. That's fair — as long as nothing opens over
 * him. However, a menu, a confirmation dialog or a toast are mounted in
 * PORTAL, at the end of `body`: in the sense of the DOM, they are "elsewhere", and the
 * panel closes on the click which targets them.
 *
 * The symptom, on the comments thread of a block: clicking “Delete”
 * in the “⋯” menu closed the panel, therefore unmounting the comment, therefore
 * took away the confirmation dialog before we could confirm. The
 * gesture didn't delete anything, nor did it say anything — it looked like an intended closing
 *. Same thing for "Modify", and for ESC, which the panel
 * intercepted in capture before the dialog saw it.
 *
 * The selectors are those of Radix (via mango-ui) and Sonner. They describe
 * a library CONVENTION rather than a component of ours: that's why
 * they live here, in one place, rather than copied into each panel.
 */

/** What lies ABOVE: a click inside is not a click “elsewhere”. */
const OVERLAY_SELECTOR = [
  // Menus, popovers, selectors, tooltips — everything Radix positions.
  "[data-radix-popper-content-wrapper]",
  '[data-slot="alert-dialog-overlay"]',
  '[data-slot="dialog-overlay"]',
  '[role="menu"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  "[data-sonner-toaster]",
].join(",");

/**
 * What ESC belongs to first.
 *
 * Narrower than above, and on purpose: a tooltip does not take
 * ESC, so the panel must remain keyboard-closable while
 * hovers a.
 */
const DISMISSIBLE_SELECTOR = '[role="menu"],[role="dialog"],[role="alertdialog"]';

/** Is the target of a click in a layer placed on top of the panel? */
export function isInOverlayLayer(node: Element | null | undefined): boolean {
  return !!node?.closest(OVERLAY_SELECTOR);
}

/** Is a menu or dialog open somewhere? So ESCAPE is his. */
export function hasOpenDismissibleLayer(root: ParentNode): boolean {
  return !!root.querySelector(DISMISSIBLE_SELECTOR);
}
