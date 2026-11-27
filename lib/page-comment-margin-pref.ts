// Whether page threads are shown as cards beside the text (MIN-1002).
//
// A preference of this browser, for every page: it is about how much of the
// window one gives to comments, which depends on the screen and not on the
// account. On by default. Kept in localStorage and shared between the page
// header, which offers the choice, and the comment layer, which follows it.

import { useSyncExternalStore } from "react";

const KEY = "minddy:page-comments-beside-text";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== "off";
  } catch {
    // Storage is blocked: the default applies, for this visit.
    return true;
  }
}

export function setMarginCommentsShown(shown: boolean): void {
  try {
    if (shown) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, "off");
  } catch {
    // Nothing to keep the choice in: it is not applied either.
    return;
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab of the same browser changed it.
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Whether threads are shown beside the text, where the window has room. */
export function useMarginCommentsShown(): boolean {
  return useSyncExternalStore(subscribe, read, () => true);
}
