"use client";

import { useEffect, useRef } from "react";

/**
 * Emits a “seen” event ONLY ONCE per logical occurrence (MIN-78).
 *
 * Why a guard and not a simple `useEffect`:
 *
 * - **React StrictMode**, active by default in Next development, goes up then
 * disassembles then reassembles each component: the effect is invoked TWICE.
 * Without guard, each opening counts double and all conversion rates
 * are false by a factor of two — which was seen in recipe with
 * `issue_create_dialog_opened` emitted twice at 3 ms interval.
 * - A simple re-rendering (prop that changes, refetch react-query) would relaunch
 * the effect too, including in production.
 *
 * `active` is the display condition (dialog open, page up); there
 * return to `false` rearms the transmission for the next opening. `key`
 * identifies the occurrence within the same opening: changing it resets
 * the emission — this is what allows you to track each step of a wizard without
 * re-track those already seen when you go back.
 */
export function useTrackView(active: boolean, key: string, emit: () => void): void {
  const seen = useRef<Set<string>>(new Set());
  // The emitter is read via a ref so that a closure is recreated on each rendering
  // (the normal case) does not restart the effect and does not double the event.
  const emitRef = useRef(emit);
  emitRef.current = emit;

  useEffect(() => {
    if (!active) {
      seen.current.clear();
      return;
    }
    if (seen.current.has(key)) return;
    seen.current.add(key);
    emitRef.current();
  }, [active, key]);
}
