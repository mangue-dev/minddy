import { hashKey, type QueryClient } from "@tanstack/react-query";
import { prActivityPreparationQueries } from "./pr-activity-query";
import { pullRequestAccountRetryAt } from "./pull-request-query";

const FRESH_MS = 60_000;
const CONCURRENCY = 3;

/** Account-owned, bounded reads after transport settles; no foreground observer. */
export function createPrActivityPreparation(
  client: QueryClient,
  schedule: (work: () => void, delay: number) => () => void = (work, delay) => {
    let idle: number | undefined;
    const timer = setTimeout(() => {
      if (typeof requestIdleCallback === "function") idle = requestIdleCallback(work);
      else work();
    }, delay);
    return () => { clearTimeout(timer); if (idle !== undefined) cancelIdleCallback(idle); };
  },
) {
  let ids: readonly string[] = [], disposed = false;
  let cancel: (() => void) | undefined;
  const active = new Map<string, readonly unknown[]>();
  const failedAt = new Map<string, number>();
  const visible = () => typeof document === "undefined" || document.visibilityState !== "hidden";
  const otherTransport = () => client.getQueryCache().getAll().some((query) =>
    query.state.fetchStatus === "fetching" && !active.has(query.queryHash));
  const enqueue = (delay = 300) => {
    if (!disposed && !cancel && visible()) cancel = schedule(prepare, delay);
  };
  const cancelUnobserved = () => {
    for (const [hash, key] of active) {
      if (client.getQueryCache().find({ queryKey: key, exact: true })?.getObserversCount() === 0) {
        active.delete(hash);
        void client.cancelQueries({ queryKey: key, exact: true });
      }
    }
  };
  const prepare = () => {
    cancel = undefined;
    if (disposed || !visible() || otherTransport()) return;
    const now = Date.now();
    const retryAt = pullRequestAccountRetryAt(client);
    if (retryAt > now) { enqueue(retryAt - now + 300); return; }
    let nextDelay = FRESH_MS;
    for (const prId of ids) {
      // An unavailable detail must not cause three additional failing requests.
      const detail = client.getQueryState<{ pr: unknown }>(["pull-request", prId]);
      if (detail?.status !== "success" || !detail.data?.pr) continue;
      for (const options of prActivityPreparationQueries(prId)) {
        const hash = hashKey(options.queryKey);
        if (active.has(hash)) continue;
        const state = client.getQueryState(options.queryKey);
        const wait = failedAt.has(hash) ? failedAt.get(hash)! + FRESH_MS - now
          : state?.status === "success" && !state.isInvalidated ? state.dataUpdatedAt + FRESH_MS - now : 0;
        if (wait > 0) { nextDelay = Math.min(nextDelay, wait); continue; }
        if (active.size >= CONCURRENCY) continue;
        // Register ownership before fetchQuery emits its cache-start event.
        active.set(hash, options.queryKey);
        void client.prefetchQuery<unknown>({ ...options, staleTime: FRESH_MS, retry: false }).finally(() => {
          active.delete(hash);
          if (disposed) return;
          if (client.getQueryState(options.queryKey)?.status === "error") failedAt.set(hash, Date.now());
          else failedAt.delete(hash);
          enqueue();
        });
      }
    }
    if (!active.size && ids.length) enqueue(Math.max(300, nextDelay));
  };
  const changed = () => {
    if (disposed) return;
    cancel?.(); cancel = undefined;
    if (!visible() || otherTransport()) { cancelUnobserved(); return; }
    enqueue();
  };
  const stop = client.getQueryCache().subscribe(changed);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", changed);
  return {
    update(recentIds: readonly string[]) {
      ids = [...new Set(recentIds)].slice(0, 5);
      changed();
    },
    dispose() {
      disposed = true; cancel?.(); stop();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", changed);
      cancelUnobserved();
    },
  };
}
