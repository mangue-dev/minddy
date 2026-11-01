import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { projectScopeKeys } from "./realtime-keys";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CATCH_UP_COALESCE_MS,
  createCatchUpQueue,
  INITIAL_CATCH_UP_COALESCE_MS,
  matchesCatchUpScope,
  refreshMissedQueries,
  trackFetchStarts,
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

  it("refreshes an active Page once after missed events, marks inactive bodies stale and isolates another account", async () => {
    vi.useFakeTimers();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const otherAccount = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const activeKey = ["page", "active"], inactiveKey = ["page", "inactive"];
    const read = vi.fn(async () => ({ id: "active", version: 2, content: "Remote changes while away" }));
    for (const account of [client, otherAccount]) {
      account.setQueryData(activeKey, { id: "active", version: 1, content: "Previously accepted body" });
      account.setQueryData(inactiveKey, { id: "inactive", version: 1, content: "Inactive body" });
    }
    const observer = new QueryObserver(client, { queryKey: activeKey, queryFn: read, staleTime: Infinity });
    const stop = observer.subscribe(() => {});
    let pending: Promise<void> | undefined;
    const queue = createCatchUpQueue((matches) => {
      pending = client.invalidateQueries({ predicate: (query) => matches(query.queryKey) });
    });
    try {
      expect(read).not.toHaveBeenCalled();
      queue.push(projectScopeKeys("project-one"));
      queue.push(projectScopeKeys("project-two"));
      await vi.advanceTimersByTimeAsync(CATCH_UP_COALESCE_MS);
      await pending;
      expect(read).toHaveBeenCalledOnce();
      expect(observer.getCurrentResult().data).toEqual({ id: "active", version: 2, content: "Remote changes while away" });
      expect(client.getQueryState(activeKey)?.isInvalidated).toBe(false);
      expect(client.getQueryState(inactiveKey)?.isInvalidated).toBe(true);
      expect(client.getQueryState(inactiveKey)?.fetchStatus).toBe("idle");
      expect(otherAccount.getQueryData(activeKey)).toEqual({ id: "active", version: 1, content: "Previously accepted body" });
      expect(otherAccount.getQueryState(activeKey)?.isInvalidated).toBe(false);
      expect(otherAccount.getQueryState(inactiveKey)?.isInvalidated).toBe(false);
    } finally { queue.cancel(); stop(); client.clear(); otherAccount.clear(); }
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

describe("refreshMissedQueries", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
  }

  it("lets a first read in flight finish, then reads it once more", async () => {
    vi.useFakeTimers({ now: 1_000 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    trackFetchStarts(client);
    const answers = [deferred<string>(), deferred<string>()];
    const signals: AbortSignal[] = [];
    let calls = 0;
    const observer = new QueryObserver(client, {
      queryKey: ["me", "board"],
      queryFn: ({ signal }) => { signals.push(signal); return answers[calls++].promise; },
    });
    const stop = observer.subscribe(() => {});
    try {
      expect(calls).toBe(1);
      vi.setSystemTime(1_500); // the channel joins while the first read is in flight
      const done = refreshMissedQueries(client, (key) => key[0] === "me", Date.now());
      expect(calls).toBe(1);
      expect(signals[0].aborted).toBe(false);
      answers[0].resolve("before the join");
      await vi.waitFor(() => expect(calls).toBe(2));
      expect(observer.getCurrentResult().data).toBe("before the join");
      answers[1].resolve("after the join");
      await done;
      expect(observer.getCurrentResult().data).toBe("after the join");
      expect(calls).toBe(2);
    } finally { stop(); client.clear(); }
  });

  it("skips a query read after the join and refreshes one read before it", async () => {
    vi.useFakeTimers({ now: 1_000 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    trackFetchStarts(client);
    const before = vi.fn(async () => "before");
    const after = vi.fn(async () => "after");
    const inactive = vi.fn(async () => "inactive");
    await client.fetchQuery({ queryKey: ["notifications"], queryFn: before });
    await client.fetchQuery({ queryKey: ["issues", "p1"], queryFn: inactive });
    const since = 1_500;
    vi.setSystemTime(since);
    const stopBefore = new QueryObserver(client, { queryKey: ["notifications"], queryFn: before, staleTime: Infinity }).subscribe(() => {});
    await client.fetchQuery({ queryKey: ["views", "global"], queryFn: after });
    const stopAfter = new QueryObserver(client, { queryKey: ["views", "global"], queryFn: after, staleTime: Infinity }).subscribe(() => {});
    try {
      await refreshMissedQueries(client, () => true, since);
      expect(before).toHaveBeenCalledTimes(2);
      expect(after).toHaveBeenCalledTimes(1);
      expect(client.getQueryState(["views", "global"])?.isInvalidated).toBe(false);
      // Inactive queries read before the join are marked stale, not fetched.
      expect(inactive).toHaveBeenCalledTimes(1);
      expect(client.getQueryState(["issues", "p1"])?.isInvalidated).toBe(true);
    } finally { stopBefore(); stopAfter(); client.clear(); }
  });

  it("passes the time of the latest push to the flush", async () => {
    vi.useFakeTimers({ now: 10_000 });
    const flush = vi.fn();
    const queue = createCatchUpQueue(flush, INITIAL_CATCH_UP_COALESCE_MS);
    queue.push([["notifications"]]);
    await vi.advanceTimersByTimeAsync(100);
    queue.push([["issues", "p1"]]);
    await vi.advanceTimersByTimeAsync(INITIAL_CATCH_UP_COALESCE_MS);
    expect(flush).toHaveBeenCalledOnce();
    expect(flush.mock.calls[0][1]).toBe(10_100);
  });
});
