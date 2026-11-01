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

import type { Query, QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Catch-up grouping window. Wide enough to cover the flight of
 * rejoin following a reconnection (the ACKs arrive in a few frames), enough
 * short so that the return to the foreground remains immediate to the eye.
 */
export const CATCH_UP_COALESCE_MS = 120;

/**
 * First subscriptions are staggered: the user channel joins first, then the
 * project list loads and project channels join. A wider one-time window merges
 * those scopes into one reconciliation request wave. Reconnects and foreground
 * resumes continue to use {@link CATCH_UP_COALESCE_MS}.
 */
export const INITIAL_CATCH_UP_COALESCE_MS = 350;

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
 * @param flush receives the predicate to pass to `invalidateQueries`, and the
 * time of the batch's latest push (see {@link refreshMissedQueries}).
 * @param delayMs grouping window.
 */
export function createCatchUpQueue(
  flush: (matches: (queryKey: readonly unknown[]) => boolean, since: number) => void,
  delayMs: number = CATCH_UP_COALESCE_MS
): CatchUpQueue {
  let pending: Set<string> | null = null;
  let since = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    push(keys) {
      if (keys.length === 0) return;
      if (!pending) pending = new Set<string>();
      for (const key of keys) pending.add(hash(key));
      since = Date.now();
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        const wanted = pending;
        pending = null;
        if (!wanted) return;
        flush((queryKey) => matchesCatchUpScope(queryKey, wanted), since);
      }, delayMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}

/** When each query last started a request, recorded by {@link trackFetchStarts}. */
const fetchStarts = new WeakMap<Query, number>();

/**
 * Records when each query of `client` starts a request. Installed when the
 * client is created: the first reads start in child effects, before any
 * provider effect could subscribe. A query without a record counts as read
 * before every catch-up.
 */
export function trackFetchStarts(client: QueryClient): () => void {
  return client.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "fetch") fetchStarts.set(event.query, Date.now());
  });
}

const readSince = (query: Query, since: number) => (fetchStarts.get(query) ?? Number.NEGATIVE_INFINITY) >= since;

function afterRequest(client: QueryClient, query: Query): Promise<void> {
  return new Promise((resolve) => {
    if (query.state.fetchStatus !== "fetching") return resolve();
    const stop = client.getQueryCache().subscribe((event) => {
      if (event.query !== query || (event.type !== "removed" && query.state.fetchStatus === "fetching")) return;
      stop();
      resolve();
    });
  });
}

/**
 * Refreshes the queries a catch-up covers, as `invalidateQueries` with the
 * same predicate did, without restarting a request already in flight.
 *
 * `since` is when the scope was (re)joined, or when the absence was noticed.
 * A request that started at or after it read every write the channel did not
 * deliver, so its query is already caught up. A request still in flight that
 * started before it may have missed one: it finishes first, then its query is
 * read once more. Invalidating it right away cancelled it and restarted it from
 * zero, which kept a cold page's first content waiting on the restart
 * (MIN-875: `/all` waited ~650 ms more for its board).
 */
export function refreshMissedQueries(
  client: QueryClient,
  matches: (queryKey: readonly unknown[]) => boolean,
  since: number,
): Promise<void> {
  const missed = (query: Query) => matches(query.queryKey) && !readSince(query, since);
  const inFlight = client.getQueryCache().findAll({
    predicate: (query) => missed(query) && query.state.fetchStatus === "fetching",
  });
  const now = client.invalidateQueries({
    predicate: (query) => missed(query) && query.state.fetchStatus !== "fetching",
  });
  const later = inFlight.map((query) => afterRequest(client, query).then(() => {
    // Removed, or read again since: nothing left to catch up.
    if (client.getQueryCache().get(query.queryHash) !== query || readSince(query, since)) return;
    return client.invalidateQueries({ queryKey: query.queryKey, exact: true });
  }));
  return Promise.all([now, ...later]).then(() => undefined);
}

/** Topics with a data change during the window, or null when unknown. */
export type ChangedTopicsCheck = (topics: string[], windowMs: number) => Promise<ReadonlySet<string> | null>;

/** Margin added to the window: the check runs a round trip after it is measured. */
export const CHANGED_TOPICS_MARGIN_MS = 5_000;

export interface InitialCatchUp {
  /** A scope's first join: its resolved topic and the keys it covers. */
  push(topic: string, keys: QueryKey[]): void;
  cancel(): void;
}

/**
 * The first joins of a page load (MIN-875). Their gap runs from the page's
 * first reads to the join; instead of re-reading every scope, ask the server
 * which topics received a change since the page started
 * (`realtime_topics_changed_since`) and re-read only those scopes. Without an
 * answer (an older database, a failed request) every scope is re-read, as
 * before.
 *
 * @param elapsedMs time since the page started, the start of every gap here.
 * @param refresh receives the covered keys' predicate and the latest join.
 */
export function createInitialCatchUp({ check, elapsedMs, refresh, delayMs = INITIAL_CATCH_UP_COALESCE_MS }: {
  check: ChangedTopicsCheck;
  elapsedMs: () => number;
  refresh: (matches: (queryKey: readonly unknown[]) => boolean, since: number) => void;
  delayMs?: number;
}): InitialCatchUp {
  let pending = new Map<string, QueryKey[]>();
  let since = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;

  const flush = async (scopes: Map<string, QueryKey[]>, joinedAt: number, current: number) => {
    let changed: ReadonlySet<string> | null = null;
    try {
      changed = await check([...scopes.keys()], Math.ceil(elapsedMs()) + CHANGED_TOPICS_MARGIN_MS);
    } catch {
      changed = null;
    }
    if (current !== generation) return;
    const wanted = new Set<string>();
    for (const [topic, keys] of scopes) {
      if (changed && !changed.has(topic)) continue;
      for (const key of keys) wanted.add(hash(key));
    }
    if (wanted.size) refresh((queryKey) => matchesCatchUpScope(queryKey, wanted), joinedAt);
  };

  return {
    push(topic, keys) {
      pending.set(topic, keys);
      since = Date.now();
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        const scopes = pending;
        pending = new Map();
        void flush(scopes, since, generation);
      }, delayMs);
    },
    cancel() {
      generation += 1;
      if (timer) clearTimeout(timer);
      timer = null;
      pending = new Map();
    },
  };
}
