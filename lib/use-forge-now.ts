"use client";

import { useSyncExternalStore } from "react";
import { useNow } from "next-intl";

let instant = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
const snapshot = () => instant;
const serverSnapshot = () => null;
function tick() {
  instant = Date.now();
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    tick();
    timer = setInterval(tick, 30_000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { clearInterval(timer); timer = undefined; }
  };
}

/** One live clock for forge timestamps, independent of the initial intl snapshot. */
export function useForgeNow(): Date {
  const initial = useNow();
  const value = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return value === null ? initial : new Date(value);
}
