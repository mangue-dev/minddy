"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useFormatter, useNow } from "next-intl";
import { normalizeForgeInstant } from "./forge-time";

/**
 * The application's only clock for relative dates (MIN-819).
 *
 * The root layout gives the intl provider a `now` captured when the document
 * was first served. A shared layout is not re-rendered on client navigation,
 * so in a tab left open (desktop app, PWA) that instant ages for hours.
 * next-intl's `useNow()` returns it unchanged, `useNow({ updateInterval })`
 * starts every mount from it, and `format.relativeTime(date)` falls back to
 * it: an event received 11 hours after the tab opened read "in 11 hours".
 *
 * The provider's instant is kept for the server render and hydration only,
 * where it keeps both sides on the same text; the browser then reads its own
 * clock. `lib/live-clock-contract.test.ts` keeps every component on this
 * module.
 */
const TICK_MS = 30_000;

let instant = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function snapshot() {
  // Without subscribers the timer is stopped, so the stored instant can be
  // hours old when a popover mounts later. Refresh it once; the next call
  // returns the same value, which `useSyncExternalStore` requires.
  if (!timer && Date.now() - instant >= TICK_MS) instant = Date.now();
  return instant;
}
const serverSnapshot = () => null;
function tick() {
  instant = Date.now();
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    tick();
    timer = setInterval(tick, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { clearInterval(timer); timer = undefined; }
  };
}

/** The current instant, refreshed every 30 seconds and on every new mount. */
export function useLiveNow(): Date {
  const hydrationNow = useNow();
  const value = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return value === null ? hydrationNow : new Date(value);
}

type InstantInput = string | number | Date | null | undefined;

/**
 * Formats an instant that has already happened ("3 minutes ago") against the
 * live clock. Zone-less ISO strings read as UTC and an instant slightly ahead
 * of this device's clock is clamped to now, so a past event never reads as a
 * future one. Returns `null` for a missing or malformed value.
 */
export function useTimeAgo(): (value: InstantInput) => string | null {
  const format = useFormatter();
  const now = useLiveNow();
  return useCallback((value: InstantInput) => {
    const iso = value instanceof Date || typeof value === "number"
      ? (Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null)
      : value;
    const when = normalizeForgeInstant(iso, now);
    return when ? format.relativeTime(when, now) : null;
  }, [format, now]);
}
