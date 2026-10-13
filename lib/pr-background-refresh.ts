import { onlineManager, QueryObserver, type QueryClient } from "@tanstack/react-query";
import { pullRequestAccountRetryAt, pullRequestQueryOptions } from "./pull-request-query";
import { navigationPreparationPending, subscribeNavigationPreparation } from "./navigation-preparation-priority";

const PERIOD_MS = 60_000;
const IDLE_MS = 100;

/** Observe shared live caches without autonomous reads; the owner serializes initial and periodic transport. */
export function createPrBackgroundRefresh(client: QueryClient) {
  const createObserver = (id: string) => new QueryObserver(client, {
    ...pullRequestQueryOptions(id), enabled: false, staleTime: PERIOD_MS, refetchOnMount: false,
    refetchInterval: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  type Observer = ReturnType<typeof createObserver>;
  const observers = new Map<string, { observer: Observer; stop: () => void }>();
  const failedAt = new Map<string, number>();
  const attemptedAt = new Map<string, number>();
  let disposed = false, timer: ReturnType<typeof setTimeout> | undefined, timerAt = 0;
  let refreshing: { id: string; observer: Observer } | undefined;
  const visible = () => typeof document === "undefined" || document.visibilityState !== "hidden";
  const dueAt = (id: string, observer: Observer) => {
    const state = observer.getCurrentQuery().state;
    const sourceDue = state.status === "error" ? Math.max(state.errorUpdatedAt, failedAt.get(id) ?? 0) + PERIOD_MS
      : state.isInvalidated ? 0 : state.dataUpdatedAt + PERIOD_MS;
    return Math.max(sourceDue, attemptedAt.has(id) ? attemptedAt.get(id)! + PERIOD_MS : 0);
  };
  const otherTransport = () => client.getQueryCache().getAll().some((query) =>
    query.state.fetchStatus === "fetching" && query.queryHash !== refreshing?.observer.getCurrentQuery().queryHash);
  const clearTimer = () => { clearTimeout(timer); timer = undefined; timerAt = 0; };
  const yieldRefresh = () => {
    const current = refreshing;
    if (!current) return;
    const query = current.observer.getCurrentQuery();
    // The explicit shell observer is known. Any additional observer retains
    // its shared foreground read, including a consumer joining during refresh.
    const ownObserver = observers.get(current.id)?.observer === current.observer;
    if (query.getObserversCount() > Number(ownObserver)) return;
    refreshing = undefined;
    void client.cancelQueries({ queryKey: query.queryKey, exact: true });
  };
  const schedule = () => {
    if (disposed || refreshing || !observers.size || !visible() || !onlineManager.isOnline() || navigationPreparationPending(client) || otherTransport()) { clearTimer(); return; }
    const now = Date.now(), retryAt = pullRequestAccountRetryAt(client);
    const due = Math.min(...[...observers].map(([id, { observer }]) => dueAt(id, observer)));
    const nextAt = Math.max(now + IDLE_MS, due, retryAt);
    if (timer && timerAt <= nextAt) return;
    clearTimer(); timerAt = nextAt;
    timer = setTimeout(refresh, nextAt - now);
  };
  const refresh = () => {
    timer = undefined; timerAt = 0;
    if (disposed || !visible() || !onlineManager.isOnline() || navigationPreparationPending(client) || otherTransport() || refreshing) return;
    const now = Date.now();
    if (pullRequestAccountRetryAt(client) > now) { schedule(); return; }
    const next = [...observers].find(([id, { observer }]) => {
      const state = observer.getCurrentQuery().state;
      return state.fetchStatus === "idle" && dueAt(id, observer) <= now;
    });
    if (!next) { schedule(); return; }
    const [id, { observer }] = next;
    const owned = { id, observer };
    refreshing = owned;
    // Aborted transport may already have reached GitHub. It still consumes
    // this minute's background attempt; navigation must not amplify the quota.
    attemptedAt.set(id, now);
    void observer.refetch({ cancelRefetch: false }).finally(() => {
      if (refreshing === owned) refreshing = undefined;
      if (disposed || !observers.has(id)) return;
      if (observer.getCurrentQuery().state.status === "error") failedAt.set(id, Date.now());
      else failedAt.delete(id);
      schedule();
    });
  };
  const changed = () => {
    if (disposed) return;
    if (!visible() || !onlineManager.isOnline() || navigationPreparationPending(client) || otherTransport()) yieldRefresh();
    schedule();
  };
  const stopCache = client.getQueryCache().subscribe(changed);
  const stopOnline = onlineManager.subscribe(changed);
  const stopPriority = subscribeNavigationPreparation(client, changed);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", changed);
  if (typeof window !== "undefined") window.addEventListener("focus", changed);
  return {
    update(ids: readonly string[]) {
      if (disposed) return;
      const retained = new Set([...new Set(ids)].slice(0, 5));
      // A cohort change must not reset an aborted request's quota interval.
      // Retired attempt markers expire after one minute instead of accumulating.
      for (const [id, at] of attemptedAt) if (Date.now() - at >= PERIOD_MS) attemptedAt.delete(id);
      for (const [id, entry] of observers) {
        if (retained.has(id)) continue;
        if (refreshing?.id === id) yieldRefresh();
        observers.delete(id); entry.stop(); failedAt.delete(id);
      }
      for (const id of retained) {
        if (observers.has(id)) continue;
        const observer = createObserver(id);
        const entry = { observer, stop: () => {} };
        observers.set(id, entry);
        entry.stop = observer.subscribe(() => {});
      }
      changed();
    },
    dispose() {
      disposed = true; clearTimer(); stopCache(); stopOnline(); stopPriority(); yieldRefresh();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", changed);
      if (typeof window !== "undefined") window.removeEventListener("focus", changed);
      for (const entry of observers.values()) entry.stop();
      observers.clear(); failedAt.clear(); attemptedAt.clear();
    },
  };
}
