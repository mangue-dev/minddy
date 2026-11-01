/**
 * Reads sent with the page (MIN-880).
 *
 * A cold load used to wait for the bundle, the session and then ~25 startup
 * requests before its first content. The document request now runs those
 * same API GET handlers on the server while the page streams
 * (`app/(app)/server-seed.tsx`, `lib/server/server-seed.ts`), and their
 * responses arrive inside the document, as promises in its server payload. This store hands each response to
 * the first read of that exact API path, in place of its network request.
 *
 * It replaces a transport, nothing else: every query keeps its own function,
 * parsing, pending-write overlays, freshness and realtime rules, because the
 * read still goes through that function and only receives a `Response` that
 * did not cross the network.
 *
 * Rules that keep it from serving anything wrong:
 * - One use per path. A later read (a refetch, an invalidation) always goes
 *   to the network.
 * - Only for the account the server read for, when the caller knows its
 *   account (`fetchClientRead`).
 * - A plan that never arrives, a path it does not list, a failed or missing
 *   response: the caller reads from the network as before. Missing
 *   responses are given up a grace period after the document has been
 *   parsed, or after a hard cap.
 * - Memory only. Responses are discarded once taken, and all of them at sign-out.
 */

/**
 * Trusted request header the proxy sets on a document load of an app route:
 * the location whose startup reads the document carries. `x-minddy-*`, so
 * the proxy strips any incoming copy.
 */
export const SERVER_SEED_PATH_HEADER = "x-minddy-seed-path";

/** A browser document navigation, not a router fetch, prefetch or refresh. */
export function isDocumentRequest(headers: Pick<Headers, "get">): boolean {
  return headers.get("sec-fetch-dest") === "document" && !headers.get("rsc") && !headers.get("next-router-prefetch");
}

export interface ServerSeedResponse {
  status: number;
  contentType: string;
  body: string;
}

export interface ServerSeedPlan {
  owner: string;
  paths: string[];
}

/** What the document carries: the plan, and one promise per planned response. */
export interface ServerSeedStream extends ServerSeedPlan {
  responses: Record<string, Promise<ServerSeedResponse | null>>;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  settled: boolean;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const entry: Deferred<T> = {
    promise: new Promise<T>((accept) => { resolve = accept; }),
    resolve: (value) => {
      if (entry.settled) return;
      entry.settled = true;
      resolve(value);
    },
    settled: false,
  };
  return entry;
}

/** Grace after the document is parsed: its last chunks still reach React. */
export const SERVER_SEED_GRACE_MS = 3_000;
/** Whatever happens, a read never waits on a seed longer than this. */
export const SERVER_SEED_MAX_WAIT_MS = 12_000;

type Store = {
  plan: Deferred<ServerSeedPlan | null>;
  owner: string | null;
  responses: Map<string, Deferred<ServerSeedResponse | null>>;
  taken: Set<string>;
  /** Wall-clock time of the page start, when the server reads began at the earliest. */
  pageStartedAt: number;
  timers: ReturnType<typeof setTimeout>[];
  stopListening: () => void;
  /** No seed can be taken any more: every later read goes to the network. */
  closed: boolean;
};

let store: Store | null = null;

function settleAll(current: Store) {
  current.plan.resolve(null);
  for (const response of current.responses.values()) response.resolve(null);
}

function close(current: Store) {
  current.closed = true;
  settleAll(current);
  for (const timer of current.timers) clearTimeout(timer);
  current.timers = [];
  current.stopListening();
  current.stopListening = () => {};
}

/**
 * The document carries seeds. Called by the shell before any query starts, so
 * a read issued before the plan streams in waits for it instead of racing it.
 */
export function expectServerSeeds(options: {
  now?: number;
  elapsedMs?: number;
  documentParsed?: boolean;
  onDocumentParsed?: (listener: () => void) => () => void;
} = {}): void {
  if (store) return;
  const now = options.now ?? Date.now();
  const elapsed = options.elapsedMs ?? (typeof performance === "undefined" ? 0 : performance.now());
  const current: Store = {
    plan: deferred(), owner: null, responses: new Map(), taken: new Set(),
    pageStartedAt: now - elapsed, timers: [], stopListening: () => {}, closed: false,
  };
  store = current;
  const giveUp = () => { if (store === current) close(current); };
  const startGrace = () => { current.timers.push(setTimeout(giveUp, SERVER_SEED_GRACE_MS)); };
  current.timers.push(setTimeout(giveUp, SERVER_SEED_MAX_WAIT_MS));
  const parsed = options.documentParsed ??
    (typeof document === "undefined" || document.readyState !== "loading");
  if (parsed) startGrace();
  else {
    const listen = options.onDocumentParsed ?? ((listener: () => void) => {
      document.addEventListener("DOMContentLoaded", listener, { once: true });
      return () => document.removeEventListener("DOMContentLoaded", listener);
    });
    current.stopListening = listen(startGrace);
  }
}

/** The server's plan: which paths it reads, for which account. */
export function deliverServerSeedPlan(plan: ServerSeedPlan | null): void {
  const current = store;
  if (!current || current.plan.settled) return;
  if (plan) {
    current.owner = plan.owner;
    for (const path of plan.paths) {
      if (!current.responses.has(path)) current.responses.set(path, deferred());
    }
  }
  current.plan.resolve(plan);
  if (!plan || current.responses.size === 0) close(current);
}

/**
 * The document's seeds, as the server payload streams them: each part is
 * delivered as soon as its promise settles. Idempotent per page load.
 */
export function receiveServerSeeds(seeds: Promise<ServerSeedStream | null>): void {
  if (store) return;
  expectServerSeeds();
  seeds.then((stream) => {
    deliverServerSeedPlan(stream && { owner: stream.owner, paths: stream.paths });
    for (const path of stream?.paths ?? []) {
      const response = stream?.responses[path];
      if (!response) deliverServerSeed(path, null);
      else response.then((value) => deliverServerSeed(path, value), () => deliverServerSeed(path, null));
    }
  }, () => deliverServerSeedPlan(null));
}

/** One response of the plan, or null when the server could not provide it. */
export function deliverServerSeed(path: string, response: ServerSeedResponse | null): void {
  store?.responses.get(path)?.resolve(response);
}

/**
 * The seeded response for `path`, once. Returns null when this page has no
 * seed for it, so the caller can fetch without waiting; otherwise a promise
 * that resolves to the response, or to null when the caller must fetch.
 */
export function takeServerSeed(path: string, owner?: string): Promise<Response | null> | null {
  const current = store;
  if (!current || current.closed || current.taken.has(path)) return null;
  if (current.plan.settled && !current.responses.has(path)) return null;
  current.taken.add(path);
  return current.plan.promise.then(async (plan) => {
    if (!plan || store !== current) return null;
    if (owner !== undefined && owner !== current.owner) return null;
    const entry = current.responses.get(path);
    if (!entry) return null;
    const seeded = await entry.promise;
    current.responses.delete(path);
    // Every planned response taken: later reads need no early start time.
    if (current.responses.size === 0) close(current);
    if (!seeded || store !== current) return null;
    return new Response(seeded.body, { status: seeded.status, headers: { "Content-Type": seeded.contentType } });
  });
}

/**
 * `fetch(path)` for a plain GET read that bypasses `fetchClientRead`: the
 * document's response when it carries one, the network otherwise.
 */
export async function fetchSeeded(path: string, init?: RequestInit): Promise<Response> {
  const seeded = takeServerSeed(path);
  return (seeded && await seeded) || fetch(path, init);
}

/**
 * Wall-clock time to record as the start of a read that begins now. While
 * seeds can still be taken, a read may receive data the server read since the
 * page started, so realtime catch-up must treat it as read that early.
 */
export function readStartTime(now: number = Date.now()): number {
  const current = store;
  return current && !current.closed ? Math.min(now, current.pageStartedAt) : now;
}

/** Sign-out and account changes: nothing seeded survives. */
export function discardServerSeeds(): void {
  const current = store;
  if (!current) return;
  close(current);
}

/** Tests only. */
export function resetServerSeedsForTests(): void {
  if (store) close(store);
  store = null;
}
