"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a first-run page (the profile, the getting-started tour) covers the
 * app (MIN-964). The surfaces those pages open read it: the wizards center on
 * the window instead of mirroring the content pane hidden underneath, and
 * Numo's panel stays compact. `<html data-first-run-open>` carries it to CSS;
 * this store carries it to components mounted outside the onboarding tree.
 */
let openLayers = 0;
const listeners = new Set<() => void>();

function sync() {
  document.documentElement.toggleAttribute("data-first-run-open", openLayers > 0);
  for (const listener of listeners) listener();
}

/** Marks a first-run page as open; the returned function closes it. */
export function openFirstRunLayer(): () => void {
  openLayers += 1;
  sync();
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    openLayers -= 1;
    sync();
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFirstRunOpen(): boolean {
  return useSyncExternalStore(subscribe, () => openLayers > 0, () => false);
}
