"use client";

import { useSyncExternalStore } from "react";
import {
  formatModShiftShortcut,
  formatModShortcut,
  resolveKeyToken,
} from "@/lib/keyboard/shortcuts";

/** The platform does not change during the session: nothing to subscribe to. */
const subscribe = () => () => {};

/**
 * The platform modifier key, only: "⌘" on a Mac,
 * "Ctrl" elsewhere. For surfaces that render keys SEPARATELY
 * (two `Kbd` side by side, like the cheat sheet).
 *
 * Why `useSyncExternalStore` and not a direct call to `resolveKeyToken`:
 * these surfaces are rendered ALSO on the server side, where `navigator` does not exist.
 * React then takes the server value for hydration and then switches back to
 * that of the browser — instead of crying about the offset. The server fallback is the
 * Windows/Linux form, the most common: it is the one that will flash the least.
 */
export function useModKey(): string {
  return useSyncExternalStore(
    subscribe,
    () => resolveKeyToken("mod"),
    () => "Ctrl"
  );
}

/**
 * The same shortcut written IN a sentence — "⌘K" on a Mac, "Ctrl+K"
 * elsewhere: a procedure or a toast needs a string, not
 * two keys side by side.
 */
export function useModShortcut(key: string): string {
  return useSyncExternalStore(
    subscribe,
    () => formatModShortcut(key),
    () => `Ctrl+${key}`
  );
}

/** The same, with ⇧ — “⌘⇧L” on a Mac, “Ctrl+Shift+L” elsewhere. */
export function useModShiftShortcut(key: string): string {
  return useSyncExternalStore(
    subscribe,
    () => formatModShiftShortcut(key),
    () => `Ctrl+Shift+${key}`
  );
}
