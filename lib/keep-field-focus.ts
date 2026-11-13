import type { MouseEvent } from "react";

/**
 * A button pressed in a composer keeps the focus in the composer's field
 * (MIN-959). Use as the composer's `onMouseDown`.
 *
 * On a phone, a press that takes the focus from the field hides the keyboard
 * first: the composer slides down with it, and the tap is spent closing the
 * keyboard instead of sending, dictating or attaching. Preventing the press's
 * default keeps the focus where it is, so the first tap is the button's. A
 * button that opens a menu or a sheet still moves the focus there itself.
 *
 * Only for a field that has the focus, and only for a button of the composer
 * itself: a menu portalled out of it (a React child, not a DOM one) keeps its
 * own focus handling.
 */
export function keepFieldFocusOnPress(event: MouseEvent<HTMLElement>): void {
  const target = event.target;
  if (!(target instanceof Element) || !event.currentTarget.contains(target)) return;
  if (!target.closest("button, [role='button']")) return;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !event.currentTarget.contains(active)) return;
  if (!active.isContentEditable && active.tagName !== "TEXTAREA" && active.tagName !== "INPUT") return;
  event.preventDefault();
}
