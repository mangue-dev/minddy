"use client";

import { useEffect, useRef } from "react";

/**
 * Escape closes the surface in front, and only it.
 *
 * Dialogs, sheets and popovers are Radix layers: each one handles Escape
 * only when it is the topmost layer. The editor's "/" and "@" menus and the
 * Numo composer's menus are not Radix layers, and Radix listens before the
 * editor does, so Escape in one of them closed the notebook or the Numo
 * panel around it as well. Those menus register here while they are open;
 * the Radix primitives ask this stack first and close its top entry instead
 * of themselves.
 */
const layers: Array<{ close: () => void }> = [];

/** Closes the frontmost registered menu; false when none is open. */
export function closeTopEscapeLayer(): boolean {
  const top = layers.at(-1);
  if (!top) return false;
  top.close();
  return true;
}

/**
 * The `onEscapeKeyDown` of a Radix primitive: an open menu inside it closes
 * first, and the primitive stays open. Otherwise the caller's handler runs.
 */
export function escapeClosesMenusFirst(handler?: (event: KeyboardEvent) => void) {
  return (event: KeyboardEvent) => {
    if (closeTopEscapeLayer()) {
      event.preventDefault();
      return;
    }
    handler?.(event);
  };
}

/** Registers `close` while `open` holds: Escape then closes this menu alone. */
export function useEscapeLayer(open: boolean, close: () => void): void {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!open) return;
    const entry = { close: () => latest.current() };
    layers.push(entry);
    return () => {
      const index = layers.indexOf(entry);
      if (index >= 0) layers.splice(index, 1);
    };
  }, [open]);
}
