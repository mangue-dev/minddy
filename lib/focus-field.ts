import type { MouseEvent } from "react";

/** What answers a tap itself inside a field's box. */
const OWN_TARGET = "button, a, input, textarea, select, label, [role='button'], [contenteditable='true'], [data-resource-pill]";

/** The field a box is drawn around. */
const FIELD = ".ProseMirror, [contenteditable='true'], textarea, input:not([type='hidden']):not([type='file'])";

/**
 * A tap on the box around a field (its padding, the row of its buttons)
 * focuses the field, caret at the end, as if the box were the field. Taps on
 * the box's own controls, or in the field, are left alone.
 */
export function focusFieldIn(event: MouseEvent<HTMLElement>) {
  const target = event.target;
  if (!(target instanceof Element) || target.closest(OWN_TARGET)) return;
  const field = event.currentTarget.querySelector<HTMLElement>(FIELD);
  if (!field || field.contains(target)) return;
  field.focus({ preventScroll: true });
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    const end = field.value.length;
    field.setSelectionRange(end, end);
    return;
  }
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(field);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}
