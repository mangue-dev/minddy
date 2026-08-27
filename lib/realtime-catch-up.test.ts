import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CATCH_UP_COALESCE_MS,
  createCatchUpQueue,
  INITIAL_CATCH_UP_COALESCE_MS,
  matchesCatchUpScope,
} from "./realtime-catch-up";

/**
 * The catch-up scope, reduced: exact keys, prefix keys
 * shared between projects, and composite key aggregates.
 */
const SCOPE = [
  ["notifications"],
  ["views", "global"],
  ["issues", "p1"],
  ["comments"],
  ["me", "board"],
];

/**
 * What a real cache contains at the end of a day: requests targeted by
 * a prefix, requests targeted identically, and neighbors which must
 * NOT move — including those whose key begins with the same string without being
 * the same prefix (`["views", "p2"]` versus `["views", "global"]`).
 */
const CACHE_KEYS = [
  ["notifications"],
  ["notifications", "unread"],
  ["views", "global"],
  ["views", "p2"],
  ["issues", "p1"],
  ["issues", "p1", "todo"],
  ["issues", "p2"],
  ["comments", "i1"],
  ["comments", "i2"],
  ["me", "board"],
  ["me", "cycle"],
  ["billing"],
  ["projects"],
];

/** What the original loop invalidated — one key after another, prefixed. */
function invalidatedByLoop(scope: unknown[][], cacheKeys: unknown[][]) {
  const hit = new Set<string>();
  for (const key of scope) {
    for (const cacheKey of cacheKeys) {
      const isPrefix =
        cacheKey.length >= key.length &&
        key.every((part, i) => Object.is(part, cacheKey[i]));
      if (isPrefix) hit.add(JSON.stringify(cacheKey));
    }
  }
  return hit;
}

describe("matchesCatchUpScope", () => {
  it("covers exactly what the key-by-key loop covered", () => {
    const wanted = new Set(SCOPE.map((k) => JSON.stringify(k)));
    const byPredicate = new Set(
      CACHE_KEYS.filter((k) => matchesCatchUpScope(k, wanted)).map((k) =>
        JSON.stringify(k)
      )
    );
    expect([...byPredicate].sort()).toEqual(
      [...invalidatedByLoop(SCOPE, CACHE_KEYS)].sort()
    );
  });

  it("does not match a partial prefix", () => {
    const wanted = new Set([JSON.stringify(["views", "global"])]);
    expect(matchesCatchUpScope(["views", "p2"], wanted)).toBe(false);
    expect(matchesCatchUpScope(["views"], wanted)).toBe(false);
  });
});

describe("createCatchUpQueue", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("scans once for an entire reconnection wave", () => {
    vi.useFakeTimers();
    const flushes: ((k: readonly unknown[]) => boolean)[] = [];
    const queue = createCatchUpQueue((matches) => flushes.push(matches));

    // A cut closes all channels at once; the joins arrive at the wire
    // ACKs, each with its own scope.
    queue.push([["issues", "p1"], ["comments"]]);
    vi.advanceTimersByTime(20);
    queue.push([["issues", "p2"], ["comments"]]);
    vi.advanceTimersByTime(20);
    queue.push([["notifications"]]);
    expect(flushes).toHaveLength(0);

    vi.advanceTimersByTime(CATCH_UP_COALESCE_MS);
    expect(flushes).toHaveLength(1);

    // …and the single sweep covers all three stacked perimeters.
    const matches = flushes[0];
    expect(matches(["issues", "p1"])).toBe(true);
    expect(matches(["issues", "p2", "todo"])).toBe(true);
    expect(matches(["comments", "i1"])).toBe(true);
    expect(matches(["notifications"])).toBe(true);
    expect(matches(["billing"])).toBe(false);
  });

  it("starts a new batch after a scan", () => {
    vi.useFakeTimers();
    const flushes: ((k: readonly unknown[]) => boolean)[] = [];
    const queue = createCatchUpQueue((matches) => flushes.push(matches));

    queue.push([["issues", "p1"]]);
    vi.advanceTimersByTime(CATCH_UP_COALESCE_MS);
    queue.push([["notifications"]]);
    vi.advanceTimersByTime(CATCH_UP_COALESCE_MS);

    expect(flushes).toHaveLength(2);
    expect(flushes[1](["issues", "p1"])).toBe(false);
    expect(flushes[1](["notifications"])).toBe(true);
  });

  it("does not scan after cancellation", () => {
    vi.useFakeTimers();
    const flushes: unknown[] = [];
    const queue = createCatchUpQueue((matches) => flushes.push(matches));
    queue.push([["issues", "p1"]]);
    queue.cancel();
    vi.advanceTimersByTime(CATCH_UP_COALESCE_MS * 10);
    expect(flushes).toHaveLength(0);
  });

  it("coalesces staggered first user and project subscriptions", () => {
    vi.useFakeTimers();
    const flushes: ((k: readonly unknown[]) => boolean)[] = [];
    const queue = createCatchUpQueue(
      (matches) => flushes.push(matches),
      INITIAL_CATCH_UP_COALESCE_MS,
    );

    queue.push([["notifications"], ["projects"]]);
    vi.advanceTimersByTime(CATCH_UP_COALESCE_MS + 100);
    queue.push([["issues", "p1"], ["me", "board"]]);

    expect(flushes).toHaveLength(0);
    vi.advanceTimersByTime(INITIAL_CATCH_UP_COALESCE_MS);
    expect(flushes).toHaveLength(1);
    expect(flushes[0](["notifications"])).toBe(true);
    expect(flushes[0](["issues", "p1"])).toBe(true);
  });
});

describe("with a real QueryClient", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * The coverage must stay identical, not merely become faster. Exercise the
   * real `invalidateQueries`, including inactive queries that an `active` filter
   * would miss.
   */
  it("marks the same active and inactive queries as the loop", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    for (const key of CACHE_KEYS) {
      client.setQueryData(key, { value: 1 });
    }
    const expected = invalidatedByLoop(SCOPE, CACHE_KEYS);
    const wanted = new Set(SCOPE.map((k) => JSON.stringify(k)));

    await client.invalidateQueries({
      predicate: (query) => matchesCatchUpScope(query.queryKey, wanted),
    });

    const stale = new Set(
      client
        .getQueryCache()
        .getAll()
        .filter((q) => q.state.isInvalidated)
        .map((q) => JSON.stringify(q.queryKey))
    );
    expect([...stale].sort()).toEqual([...expected].sort());
    client.clear();
  });
});
