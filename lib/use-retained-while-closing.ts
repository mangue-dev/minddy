"use client";

import { useEffect, useState } from "react";

/**
 * How long a closed overlay keeps its content mounted. Longer than the
 * slowest exit animation of the dialog, sheet and side panel primitives
 * (`components/ui/`), so Radix can play it to the end before the caller
 * unmounts anything.
 */
export const OVERLAY_EXIT_MS = 300;

/**
 * Keeps an overlay's subject on screen while the overlay closes (MIN-774).
 *
 * Callers usually close a panel by clearing what it shows (`setOpenIssueId(null)`,
 * a host returning `null`), which unmounts the panel before its exit animation
 * starts. This returns the live value, or the last non-null one for
 * `OVERLAY_EXIT_MS` after it cleared; render with `open={value != null}` so
 * the overlay animates out over the retained content.
 */
export function useRetainedWhileClosing<T>(value: T | null | undefined): T | null {
  const [retained, setRetained] = useState<T | null>(value ?? null);
  // Adopt each new value during render, so a reopened overlay never shows the
  // previous subject for a frame.
  if (value != null && value !== retained) setRetained(value);

  useEffect(() => {
    if (value != null) return;
    const timer = setTimeout(() => setRetained(null), OVERLAY_EXIT_MS);
    return () => clearTimeout(timer);
  }, [value]);

  return value ?? retained;
}
