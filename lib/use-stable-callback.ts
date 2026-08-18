"use client";

import { useCallback, useRef } from "react";

/**
 * A STABLE identity for a handler that is rewritten each time it is rendered.
 *
 * The case that gave rise to it (MIN-316): the ticket card passes eleven handlers
 * to `useAgentMenuActions`, which has them all as dependencies of its `useMemo`. Like
 * each is an arrow manufactured in the body of the component, the memo NEVER fell correctly — it remade around twenty action objects and
 * as many JSX icons, per card and per rendering, for a closed menu.
 *
 * The stabilizing one by one would require eleven lists of dependencies to hold, on
 * functions which each close on around ten local values: a
 * forgotten list would give a handler which acts on an expired ticket, silently.
 * This hook therefore returns an envelope whose identity never changes and which
 * always calls the LAST version — reading is done on call, so
 * after rendering.
 *
 * ⚠ **Not for a value read during rendering.** This is an event handler:
 * called during rendering, it would read a version of which React does not guarantee nothing.
 * For a value, `useMemo`; for an effect dependency, a real
 * `useCallback` with its dependencies — an effect that never replays because its dependency is artificially stable is a bug, not an optimization.
 */
export function useStableCallback<A extends unknown[], R>(
  fn: (...args: A) => R
): (...args: A) => R {
  const latest = useRef(fn);
  // During rendering, and not in an effect: the handler must be up to date before
  // that a memorized child cannot call it, and an effect happens afterwards.
  latest.current = fn;
  return useCallback((...args: A) => latest.current(...args), []);
}
