import { hashKey, type Query, type QueryClient, type QueryKey } from "@tanstack/react-query";

type Priority = { startedAt: number; expiresAt: number; now: () => number; keys: Set<string>; closed: boolean; stop?: () => void };
const clients = new WeakMap<QueryClient, Priority>();
const families = new Set(["issues", "members", "objectives", "pages", "page"]);
const MAX_KEYS = 128;
const INITIAL_DOCUMENT_WINDOW_MS = 15_000;
const documentStartedAt = () => typeof window === "undefined" ? Date.now() : Math.floor(performance.timeOrigin);
const inScope = (key: QueryKey) => key.length === 2 && families.has(String(key[0])) && typeof key[1] === "string";
function close(state: Priority) { state.closed = true; state.keys.clear(); state.stop?.(); state.stop = undefined; }
function expired(state: Priority): boolean {
  if (!state.closed && state.now() > state.expiresAt) close(state);
  return state.closed;
}
function mark(state: Priority, query: Query): void {
  if (!inScope(query.queryKey) || expired(state)) return;
  const hash = hashKey(query.queryKey);
  if (!state.keys.has(hash) && state.keys.size >= MAX_KEYS) { close(state); return; }
  state.keys.add(hash);
}

/** Install on a new account client before consumers; retain only bounded key tombstones. */
export function observeRestoredPageBootstrapPriority(client: QueryClient,
  { startedAt = documentStartedAt(), now = Date.now }: { startedAt?: number; now?: () => number } = {}): void {
  if (clients.has(client)) return;
  const state: Priority = { startedAt, expiresAt: startedAt + INITIAL_DOCUMENT_WINDOW_MS, now, keys: new Set(), closed: false };
  clients.set(client, state);
  const cache = client.getQueryCache();
  // A late observer cannot reconstruct errors or removals that already happened.
  if (!Number.isFinite(startedAt) || startedAt <= 0 || cache.getAll().length || expired(state)) { close(state); return; }
  state.stop = cache.subscribe((event) => {
    if (expired(state) || !inScope(event.query.queryKey)) return;
    if (event.type === "removed") { mark(state, event.query); return; }
    if (event.type === "added") {
      if (event.query.state.dataUpdatedAt >= startedAt) mark(state, event.query);
      return;
    }
    if (event.type !== "updated") return;
    if (["fetch", "error", "invalidate"].includes(event.action.type)) { mark(state, event.query); return; }
    if ((event.action.type === "success" || event.action.type === "setState") &&
        (event.query.state.dataUpdatedAt >= startedAt || event.query.state.error || event.query.state.isInvalidated ||
          event.query.state.fetchStatus !== "idle")) mark(state, event.query);
  });
}

/** An absent, retired or expired observer can never authorize an old streamed record. */
export function restoredPageBootstrapPriority(client: QueryClient, key: QueryKey): "admissible" | "priority" | "closed" {
  const state = clients.get(client);
  if (!state || expired(state)) return "closed";
  const marked = state.keys.has(hashKey(key));
  if (!marked && state.keys.size >= MAX_KEYS) { close(state); return "closed"; }
  return marked ? "priority" : "admissible";
}
