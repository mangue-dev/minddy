"use client";

import { useState, useEffect, useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}

/**
 * SSR-safe media query hook. Returns `false` on server and during hydration
 * to prevent mismatches, then updates to the real value after mount.
 */
export function useMediaQuery(query: string): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const matches = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );

  // During SSR and first client render, return false to match server output
  if (!mounted) return false;
  return matches;
}
