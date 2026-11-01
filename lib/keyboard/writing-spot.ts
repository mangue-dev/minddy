/**
 * A shortcut that opens a menu while the user writes (⌘⇧P for the project,
 * ⌘⇧F for Smart Fill) must give the text back exactly as it was: the focused
 * field and, for a plain input, its caret and selection.
 */

/** Where the writer was when the shortcut opened the menu: the field, and the
 *  caret of a plain input (an editor keeps its own selection across a blur). */
export type WritingSpot = {
  element: HTMLElement;
  range: { start: number | null; end: number | null; direction: "forward" | "backward" | "none" | null } | null;
};

export function captureWritingSpot(): WritingSpot | null {
  const element = document.activeElement;
  if (!(element instanceof HTMLElement) || element === document.body) return null;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return {
      element,
      range: { start: element.selectionStart, end: element.selectionEnd, direction: element.selectionDirection },
    };
  }
  return { element, range: null };
}

export function restoreWritingSpot(spot: WritingSpot) {
  if (!spot.element.isConnected) return;
  spot.element.focus({ preventScroll: true });
  const { element, range } = spot;
  if (range && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
      range.start !== null && range.end !== null) {
    element.setSelectionRange(range.start, range.end, range.direction ?? undefined);
  }
}
