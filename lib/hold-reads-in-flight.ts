import { QueryObserver, type Query, type QueryClient } from "@tanstack/react-query";

/** A held read is released at the latest after this, even if it never settles. */
const HOLD_LIMIT_MS = 10_000;

/**
 * Keeps every observed read in flight alive while the tree observing it is
 * replaced by another one that reads the same queries.
 *
 * A query cancels its request when its last observer leaves and the request
 * used its abort signal. On a cold load the startup page renders as plain
 * route children, then moves into its retained view once the tab session
 * exists (components/app-tab-view-host.tsx): the old tree unsubscribes before
 * the new one subscribes, so the page's first reads were cancelled and
 * restarted 50–115 ms later (MIN-875). A disabled observer per read bridges
 * that gap: it fetches nothing, counts as no active observer, and the new
 * tree's observers join the request already running.
 *
 * Call it before the old tree's passive effects run (a layout effect in the
 * commit that replaces it). Each hold ends when its read settles, or after
 * {@link HOLD_LIMIT_MS}; the returned function ends them all.
 */
export function holdReadsInFlight(client: QueryClient): () => void {
  const reads = client.getQueryCache().findAll({ fetchStatus: "fetching" })
    .filter((query) => query.getObserversCount() > 0);
  const releases = reads.map((query) => hold(client, query));
  return () => { for (const release of releases) release(); };
}

function hold(client: QueryClient, query: Query): () => void {
  const observer = new QueryObserver(client, { queryKey: query.queryKey, queryHash: query.queryHash, enabled: false });
  const unsubscribe = observer.subscribe(() => {});
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(limit);
    stopWatching();
    unsubscribe();
  };
  const stopWatching = client.getQueryCache().subscribe((event) => {
    if (event.query === query && (event.type === "removed" || query.state.fetchStatus !== "fetching")) release();
  });
  const limit = setTimeout(release, HOLD_LIMIT_MS);
  return release;
}
