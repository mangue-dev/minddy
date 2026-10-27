"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Dialog exit time: the content's `data-closed:duration-150` in
 * components/ui/dialog.tsx and alert-dialog.tsx, plus a frame of margin.
 */
export const DIALOG_EXIT_MS = 200;

/**
 * What a dialog shows while it plays its close animation.
 *
 * A dialog that empties its form, or whose content comes from a target the
 * caller clears on close (`open={target !== null}`), would otherwise fade out
 * blank: the content jumps to empty on the first closed frame. These hooks
 * keep the last open content on screen until the dialog is gone.
 */

/** `value` while open; once closed, the last value seen while open. */
export function useValueWhileOpen<T>(open: boolean, value: T): T {
  const last = useRef(value);
  if (open) last.current = value;
  return open ? value : last.current;
}

/**
 * Defers a form reset until the dialog has finished closing.
 *
 * `scheduleReset()` before closing replaces calling `reset()` directly. The
 * reset then runs once the exit animation is over, or before the next paint
 * if the dialog reopens sooner. `resetPending` is true in between, and until
 * the reset has rendered: a caller that checks whether its form holds content
 * (an automatic draft, say) must treat a pending reset as an empty form, even
 * from an effect of the reopening render that still sees the old state.
 * `resets` counts the resets applied: a field whose `autoFocus` must follow
 * the fresh form can take it as its `key`, since that reopening render has
 * already mounted it.
 */
export function useResetAfterClose(open: boolean, reset: () => void) {
  const resetPending = useRef(false);
  const latestReset = useRef(reset);
  useLayoutEffect(() => {
    latestReset.current = reset;
  });
  const [resets, setResets] = useState(0);
  const flushing = useRef(false);
  const flush = useCallback(() => {
    if (!resetPending.current || flushing.current) return;
    flushing.current = true;
    latestReset.current();
    setResets((count) => count + 1);
  }, []);
  // The render that applies the reset has committed: the form is truly empty.
  useEffect(() => {
    if (!flushing.current) return;
    flushing.current = false;
    resetPending.current = false;
  }, [resets]);
  useEffect(() => {
    if (open || !resetPending.current) return;
    const timer = window.setTimeout(flush, DIALOG_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open, flush]);
  // Reopened before the timer: the form starts blank, not on the old content.
  useLayoutEffect(() => {
    if (open) flush();
  }, [open, flush]);
  const scheduleReset = useCallback(() => {
    resetPending.current = true;
  }, []);
  return { scheduleReset, resetPending, resets };
}
