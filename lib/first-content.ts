import { useSyncExternalStore } from "react";

/**
 * "The page has shown its first content" (MIN-880), for code that would
 * otherwise download or mount optional surfaces while a cold load still
 * waits on its reads: idle preloads (palette, panels, editor) and the
 * always-mounted Numo and notebook shells. On a throttled first visit those
 * bytes competed with the reads and the page's own code; idle callbacks fire
 * during exactly that wait, because the main thread is idle while the
 * network works.
 *
 * Reached once per page load, at the first of:
 * - the startup reads have settled (no query fetching) and the page shows no
 *   skeleton: reads served with the document settle before the startup view
 *   has even mounted, so settled reads alone do not mean content;
 * - a user intent (pointer or key press), so a gesture made early starts its
 *   surface at once;
 * - {@link FIRST_CONTENT_MAX_WAIT_MS}, so nothing waits forever on a slow or
 *   polling read.
 */

export const FIRST_CONTENT_MAX_WAIT_MS = 5_000;

let reached = false;
let listeners = new Set<() => void>();

export function hasReachedFirstContent(): boolean {
  return reached;
}

export function markFirstContent(): void {
  if (reached) return;
  reached = true;
  const pending = listeners;
  listeners = new Set();
  for (const listener of pending) listener();
}

/** Run `listener` once the first content is reached (now if it already is). */
export function onFirstContent(listener: () => void): () => void {
  if (reached) {
    listener();
    return () => {};
  }
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Watch for the first content: `isFetching` reports the client's reads in
 * flight and `subscribe` notifies when that may have changed. Returns a stop
 * function; marks at most once.
 */
/** What the app shows while content loads: skeletons and pending routes. */
export const LOADING_CONTENT_SELECTOR = "[data-slot=skeleton], [data-pending-route]";

const CONTENT_RECHECK_MS = 100;

function documentShowsContent(): boolean {
  return typeof document === "undefined" || !document.querySelector(LOADING_CONTENT_SELECTOR);
}

/**
 * Watch for the first content: `isFetching` reports the client's reads in
 * flight, `subscribe` notifies when that may have changed and `showsContent`
 * tells whether the page has left its loading state. Returns a stop
 * function; marks at most once.
 */
export function watchFirstContent({
  isFetching, subscribe, showsContent = documentShowsContent,
  target = typeof window === "undefined" ? undefined : window,
}: {
  isFetching: () => number;
  subscribe: (notify: () => void) => () => void;
  showsContent?: () => boolean;
  target?: Pick<Window, "addEventListener" | "removeEventListener">;
}): () => void {
  if (reached) return () => {};
  let started = false;
  let recheck: ReturnType<typeof setTimeout> | undefined;
  const stops: (() => void)[] = [];
  const stop = () => {
    clearTimeout(recheck);
    for (const fn of stops.splice(0)) fn();
  };
  const done = () => { stop(); markFirstContent(); };
  const check = () => {
    clearTimeout(recheck);
    recheck = undefined;
    // Settled only after the startup reads have begun, not before the first one.
    if (isFetching() > 0) { started = true; return; }
    if (!started) return;
    // A lazy view or its own reads may still be on their way.
    if (showsContent()) done();
    else recheck = setTimeout(check, CONTENT_RECHECK_MS);
  };
  stops.push(subscribe(check));
  const timer = setTimeout(done, FIRST_CONTENT_MAX_WAIT_MS);
  stops.push(() => clearTimeout(timer));
  if (target) {
    const intent = () => done();
    target.addEventListener("pointerdown", intent, { capture: true, passive: true });
    target.addEventListener("keydown", intent, { capture: true });
    stops.push(() => {
      target.removeEventListener("pointerdown", intent, { capture: true });
      target.removeEventListener("keydown", intent, { capture: true });
    });
  }
  check();
  return stop;
}

/**
 * `requestIdleCallback(run, { timeout })` once the first content is reached,
 * `setTimeout(run, fallbackMs)` where idle callbacks do not exist. Returns
 * a cancel function.
 */
export function afterFirstContentIdle(run: () => void, timeout: number, fallbackMs: number): () => void {
  let cancelIdle = () => {};
  const stop = onFirstContent(() => {
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(run, { timeout });
      cancelIdle = () => window.cancelIdleCallback(handle);
    } else {
      const handle = window.setTimeout(run, fallbackMs);
      cancelIdle = () => window.clearTimeout(handle);
    }
  });
  return () => { stop(); cancelIdle(); };
}

const subscribeFirstContent = (notify: () => void) => onFirstContent(notify);

/** False until the first content is reached, then true for the rest of the page. */
export function useAfterFirstContent(): boolean {
  return useSyncExternalStore(subscribeFirstContent, hasReachedFirstContent, () => false);
}

/** Tests only. */
export function resetFirstContentForTests(): void {
  reached = false;
  listeners.clear();
}
