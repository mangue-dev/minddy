import { eventKey } from "@/lib/keyboard/event-key";
import { isVisibleOverlay } from "@/lib/visible-overlays";

/**
 * Is the keystroke the platform's find shortcut: ⌘F on a Mac, Ctrl+F
 * elsewhere?
 *
 * Only the platform's own modifier: on a Mac, Ctrl+F moves the caret one
 * character forward in every text field, and the editor keeps that. A held
 * key (`repeat`) still matches, so a long press never falls through to the
 * browser's own find halfway.
 */
export function matchesFindShortcut(
  e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
  mac: boolean,
): boolean {
  if (e.shiftKey || e.altKey) return false;
  if (mac ? !e.metaKey || e.ctrlKey : !e.ctrlKey || e.metaKey) return false;
  return eventKey(e) === "f";
}

const OPEN_DIALOGS = '[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"]';

/**
 * Does this document surface own the screen, so that ⌘F searches it rather
 * than the whole browser page?
 *
 * - It must be displayed: retained pages stay mounted with `display: none`.
 * - When dialogs are open, it must sit in the topmost one (the last opened,
 *   portaled last): the notebook over a page, a page side panel over the full
 *   page. A dialog that does not hold it, a confirmation or a picker, keeps
 *   the browser's find.
 */
export function surfaceOwnsScreen(
  surface: Element,
  isVisible: (element: Element) => boolean = isVisibleOverlay,
): boolean {
  if (!isVisible(surface)) return false;
  const dialogs = Array.from(surface.ownerDocument.querySelectorAll(OPEN_DIALOGS)).filter(isVisible);
  const top = dialogs.at(-1);
  if (!top) return !surface.closest('[role="dialog"],[role="alertdialog"]');
  return top.contains(surface);
}
