/**
 * Catch-up of caches: what is invalidated when the page has missed caches
 * events — return from an absence, channel fallen then rejoined.
 *
 * The perimeter to be caught is a list of PREFIX-keys (`["comments"]` aims
 * all `["comments", issueId]` requests). The naive gesture is to play them
 * one by one:
 *
 * ```ts
 * for (const key of keys) queryClient.invalidateQueries({ queryKey: key });
 * ```
 *
 * Each call scans the cache TWICE — `findAll` from `invalidateQueries`,
 * then that of `refetchQueries` which he connects. The scope of a recovery is
 * 9 user keys + 32 keys per project, capped at 25 channels: ~85 calls
 * (~170 courses) on a five project account, ~300 (~600 courses) on the ceiling.
 * All in a synchronous loop, at the moment of return to the foreground —
 * that is to say right at the moment of the first gesture (MIN-300).
 *
 * Restricting the scope was not an option: `type: "active"` would break the
 * marking inactive requests, and limiting them to projects on the screen would break the
 * aggregates that the sidebar reads on all pages. What we change is
 * therefore the NUMBER OF COURSES, not the coverage: only one `invalidateQueries`
 * with a predicate that recognizes the same queries.
 *
 * And since a socket cut causes all the channels to drop at once — a
 * only WebSocket carries the 26 topics —, the joins arrive over the ACKs,
 * each with its own catch-up, spread over several images (MIN-305). Hence
 * the line: we stack the prefixes and we only sweep once, at the end.
 *
 * Separated from the provider to be testable: vitest runs on bare node, without React
 * (same reason as lib/realtime-topics.ts).
 */

import type { QueryKey } from "@tanstack/react-query";

/**
 * Catch-up grouping window. Wide enough to cover the flight of
 * rejoin following a reconnection (the ACKs arrive in a few frames), enough
 * short so that the return to the foreground remains immediate to the eye.
 */
export const CATCH_UP_COALESCE_MS = 120;

/** The identity of a key in the queue — the same as react-query. */
const hash = (key: readonly unknown[]): string => JSON.stringify(key);

/**
 * Is a request covered by this scope?
 *
 * Exactly reproduces the prefix semantics of `invalidateQueries({ queryKey })`:
 * `["comments"]` targets `["comments", issueId]`, and a key also targets the query
 * which is identical to it. We go up the prefixes from longest to shortest,
 * because the perimeter keys are short and the first try which
 * match is almost always one of the last.
 */
export function matchesCatchUpScope(
  queryKey: readonly unknown[],
  wanted: ReadonlySet<string>
): boolean {
  for (let n = queryKey.length; n > 0; n--) {
    if (wanted.has(hash(queryKey.slice(0, n)))) return true;
  }
  return false;
}

export interface CatchUpQueue {
  /** Stack a perimeter. The scan leaves at the latest {@link CATCH_UP_COALESCE_MS} afterwards. */
  push(keys: QueryKey[]): void;
  /** Forget what is pending (disassembly). */
  cancel(): void;
}

/**
 * The catch-up line.
 *
 * ⚠ Deliberately SEPARATE from coalescence by key of current events
 * (`invalidateCoalesced` in the provider). This map carries the mode of
 * refetch in its identity (`${refetch}:${hash}`) so that a `"none"` does not swallow
 * not a pending `"active"`; sharing both would reintroduce this exact bug.
 *
 * @param flush receives the predicate to pass to `invalidateQueries`.
 * @param delayMs grouping window.
 */
export function createCatchUpQueue(
  flush: (matches: (queryKey: readonly unknown[]) => boolean) => void,
  delayMs: number = CATCH_UP_COALESCE_MS
): CatchUpQueue {
  let pending: Set<string> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    push(keys) {
      if (keys.length === 0) return;
      if (!pending) pending = new Set<string>();
      for (const key of keys) pending.add(hash(key));
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        const wanted = pending;
        pending = null;
        if (!wanted) return;
        flush((queryKey) => matchesCatchUpScope(queryKey, wanted));
      }, delayMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}
