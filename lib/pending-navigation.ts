"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

/**
 * A user navigation the router has not committed yet (MIN-843).
 *
 * Next keeps the outgoing page on screen until the destination's payload and
 * code arrive, so a cold destination left the sidebar and the content on the
 * old page for as long as that took. The shell reads this destination instead:
 * the sidebar selects it and the tab panel shows its skeleton, then the route
 * commit hands over to the real page.
 */
export interface PendingNavigation {
  /** Destination path, query and hash. */
  href: string;
  pathname: string;
  search: string;
  /** The pathname the navigation leaves; any other committed route retires it. */
  from: string;
}

/** A warm destination commits within a frame or two: it never shows the
 * pending state, so it cannot flash a skeleton. */
export const PENDING_NAVIGATION_DELAY_MS = 50;
/** A navigation that never commits (a failed request) must not pin the shell. */
export const PENDING_NAVIGATION_TIMEOUT_MS = 15_000;

let started: PendingNavigation | null = null;
let shown: PendingNavigation | null = null;
let delayTimer: ReturnType<typeof setTimeout> | undefined;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
let listeningToHistory = false;
const listeners = new Set<() => void>();

function publish(next: PendingNavigation | null) {
  if (shown === next) return;
  shown = next;
  for (const listener of listeners) listener();
}

function clearTimers() {
  clearTimeout(delayTimer);
  clearTimeout(expiryTimer);
  delayTimer = expiryTimer = undefined;
}

/** Record the destination of a navigation that is starting now. A destination
 * on the current pathname is an in-page update, not a page change. */
export function beginPendingNavigation(href: string): void {
  if (typeof window === "undefined") return;
  let url: URL;
  try { url = new URL(href, window.location.href); } catch { return; }
  const from = window.location.pathname;
  if (url.origin !== window.location.origin || url.pathname === from) {
    clearPendingNavigation();
    return;
  }
  if (!listeningToHistory) {
    // Back and forward replace whatever destination was pending.
    window.addEventListener("popstate", clearPendingNavigation);
    listeningToHistory = true;
  }
  clearTimers();
  const next: PendingNavigation = {
    href: `${url.pathname}${url.search}${url.hash}`,
    pathname: url.pathname,
    search: url.searchParams.toString(),
    from,
  };
  started = next;
  const settle = () => {
    if (started !== next) return;
    // The window may be gone by then (a torn-down test environment).
    if (typeof window !== "undefined" && window.location.pathname === next.from) publish(next);
    else clearPendingNavigation();
  };
  // A destination replacing one already on screen shows at once.
  if (shown) settle();
  else delayTimer = setTimeout(settle, PENDING_NAVIGATION_DELAY_MS);
  expiryTimer = setTimeout(() => {
    if (started === next) clearPendingNavigation();
  }, PENDING_NAVIGATION_TIMEOUT_MS);
}

export function clearPendingNavigation(): void {
  clearTimers();
  started = null;
  publish(null);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
const snapshot = () => shown;
const serverSnapshot = () => null;

/** The pending destination, or null once the router has left its origin. */
export function usePendingNavigation(): PendingNavigation | null {
  const pathname = usePathname();
  const pending = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const retired = !!pending && pending.from !== pathname;
  useEffect(() => {
    if (retired && shown === pending) clearPendingNavigation();
  }, [retired, pending]);
  return retired ? null : pending;
}

/** The pathname the shell presents: the pending destination ahead of the
 * router's commit, the committed route otherwise. */
export function useDisplayedPathname(): string {
  const pathname = usePathname();
  return usePendingNavigation()?.pathname ?? pathname;
}
