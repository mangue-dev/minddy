import { hashKey, onlineManager, type Query, type QueryClient } from "@tanstack/react-query";
import { prepareAppTabSurface } from "./app-tab-surfaces";
import { preparePageNavigation } from "./use-pages-query";
import { appTabRoute } from "./app-tab-location";
import { appTabPreparationQueries, prefetchPullRequestDetail } from "./prefetch-tab-destination";
import { isCachedTabReconciliation, navigationPreparationPriority } from "./navigation-preparation-priority";
import { allPullRequestsQueryOptions } from "./use-agent-runs";
import { prActivityPreparationQueries } from "./pr-activity-query";
import { createPageNavigationPreparation } from "./page-navigation-preparation";
import { adjacentProjectDestination } from "./project-navigation-working-set";

const PASSIVE_SHELL_READS = new Set([
  ["me", "summary"], ["me", "triage-counts"], ["me", "smart-assign-warnings"],
  ["me", "branch-cleanup-targets"], ["pull-requests", "open-count"],
].map(hashKey));

/** Only established shell summaries may reconcile alongside one scoped preparation read. */
export function isPassiveShellMaintenanceRead(query: Pick<Query, "queryKey" | "queryHash" | "state">): boolean {
  if (query.state.status !== "success" || query.state.data === undefined) return false;
  if (PASSIVE_SHELL_READS.has(query.queryHash)) return true;
  // This exact producer belongs to tab labels, with no route or editing authority.
  const key = query.queryKey;
  return key.length === 3 && key[0] === "app-tab-metadata" && typeof key[1] === "string" && key[1].length > 0 &&
    Array.isArray(key[2]) && key[2].every((href) => typeof href === "string");
}

/** Recent visible detail activities precede optional lists for old pinned PRs. */
function recentActivityQueries(client: QueryClient) {
  const list = client.getQueryData<{ pullRequests: { prId: string; pr_state: string }[] }>(allPullRequestsQueryOptions().queryKey);
  const recent = [...new Set((list?.pullRequests ?? []).filter((pr) => ["open", "draft"].includes(pr.pr_state)).map((pr) => pr.prId))].slice(0, 5);
  return recent.flatMap((id) => {
    const detail = client.getQueryState<{ pr: unknown }>(["pull-request", id]);
    return detail?.status === "success" && detail.data?.pr ? prActivityPreparationQueries(id) : [];
  });
}

function missingRecentActivity(client: QueryClient): boolean {
  return recentActivityQueries(client).some((options) => {
    const state = client.getQueryState(options.queryKey);
    return state?.status !== "error" && (state?.data === undefined || state.isInvalidated);
  });
}

/** Only the displayed working set is prepared; larger accounts keep normal intent navigation. */
export const RESTORED_TAB_PREPARATION_LIMIT = 10;

/** Drain a finite account-owned working set, yielding each read to foreground work. */
export function createPrTabPreparation(
  client: QueryClient,
  schedule: (work: () => void) => () => void = (work) => {
    let idle: number | undefined;
    const timer = setTimeout(() => {
      if (typeof requestIdleCallback === "function") idle = requestIdleCallback(work, { timeout: 200 });
      else work();
    }, 0);
    return () => { clearTimeout(timer); if (idle !== undefined) cancelIdleCallback(idle); };
  },
) {
  const pagePreparation = createPageNavigationPreparation(client);
  const visits: string[] = [];
  let available: readonly string[] = [];
  let active = "", disposed = false;
  const neighborAttempts = new Map<string, number>();
  const attempted = new Set<string>();
  let cancel: (() => void) | undefined;
  type Read = { key: readonly unknown[]; identity: string; cancelled: boolean };
  let preparing: Read | undefined;
  const priority = navigationPreparationPriority(client);
  const visible = () => typeof document === "undefined" || document.visibilityState !== "hidden";
  const cancelScheduled = () => { cancel?.(); cancel = undefined; };
  const missing = (key: readonly unknown[]) => {
    const state = client.getQueryState(key);
    return state?.data === undefined || state.isInvalidated || state.status === "error";
  };
  const otherTransport = () => {
    const auxiliary = new Set(recentActivityQueries(client).map((options) => hashKey(options.queryKey)));
    return client.getQueryCache().getAll().some((query) => query.state.fetchStatus === "fetching" && !isCachedTabReconciliation(query) && !isPassiveShellMaintenanceRead(query) &&
      query.queryHash !== (preparing ? hashKey(preparing.key) : undefined) &&
      !(auxiliary.has(query.queryHash) && !query.isActive()));
  };
  type PreparedQuery = { options: ReturnType<typeof appTabPreparationQueries>[number]; identity: string };
  type Destination = { href: string; route: ReturnType<typeof appTabRoute>; queries: PreparedQuery[] };
  let listed: Destination[] = [], neighbor: Destination | undefined;
  const manifest = new Map<string, { query: PreparedQuery; neighboring: boolean }>();
  const pendingKeys = new Set<string>();
  const destination = (href: string): Destination => ({ href, route: appTabRoute(href),
    queries: appTabPreparationQueries(client, href).map((options) => ({ options, identity: hashKey(options.queryKey) })) });
  const refreshPending = (identity?: string) => {
    const update = (key: string, entry: { query: PreparedQuery; neighboring: boolean }) => {
      if (!attempted.has(key) && missing(entry.query.options.queryKey) &&
          (!entry.neighboring || Date.now() - (neighborAttempts.get(key) ?? -Infinity) >= 30_000)) pendingKeys.add(key);
      else pendingKeys.delete(key);
    };
    if (identity) { const entry = manifest.get(identity); if (entry) update(identity, entry); }
    else { pendingKeys.clear(); for (const [key, entry] of manifest) update(key, entry); }
  };
  const refreshNeighbor = () => {
    const href = adjacentProjectDestination(client, active, visits, available);
    const next = href && !available.includes(href) ? href : undefined;
    if (next === neighbor?.href) return;
    neighbor = next ? destination(next) : undefined;
    manifest.clear();
    for (const item of listed) for (const query of item.queries) manifest.set(query.identity, { query, neighboring: false });
    for (const query of neighbor?.queries ?? []) if (!manifest.has(query.identity)) manifest.set(query.identity, { query, neighboring: true });
    refreshPending();
  };
  const rebuildManifest = () => {
    listed = available.filter((href) => href !== active).map(destination).filter((item) => item.queries.length);
    neighbor = undefined; manifest.clear();
    for (const item of listed) for (const query of item.queries) manifest.set(query.identity, { query, neighboring: false });
    refreshNeighbor(); refreshPending();
  };
  const actionable = (item: Destination) => item.queries.some((query) => pendingKeys.has(query.identity));
  const enqueue = () => {
    if (!disposed && pendingKeys.size && !cancel && !preparing && visible() && onlineManager.isOnline() && !otherTransport()) cancel = schedule(prepare);
  };
  const yieldRead = () => {
    if (!preparing || preparing.cancelled || client.getQueryCache().find({ queryKey: preparing.key, exact: true })?.getObserversCount()) return;
    preparing.cancelled = true;
    // Cancellation is neither completion nor failure. Retry after foreground
    // transport settles, while retaining the same finite working set.
    attempted.delete(preparing.identity);
    refreshPending(preparing.identity);
    void client.cancelQueries({ queryKey: preparing.key, exact: true });
  };
  const prepare = () => {
    cancel = undefined;
    if (disposed || preparing || !visible() || !onlineManager.isOnline() || otherTransport()) return;
    const firstPage = listed.find((item) => item.route.pageId);
    if (firstPage) pagePreparation.prioritize(firstPage.href);
    const missingNavigation = listed.some((item) => item.route.section !== "pull-requests" && actionable(item));
    if (missingNavigation) priority.acquire(); else priority.release();
    // Optional neighboring data never displaces a listed destination.
    for (const item of [...listed, ...(neighbor ? [neighbor] : [])]) {
      const route = item.route;
      const neighboring = item === neighbor;
      if (route.section === "pull-requests" && !missingNavigation && missingRecentActivity(client)) return;
      for (const { options, identity } of item.queries) {
        if (!pendingKeys.has(identity)) continue;
        if (neighboring && Date.now() - (neighborAttempts.get(identity) ?? -Infinity) < 30_000) continue;
        const detail = options.queryKey[0] === "pull-request";
        // The helper keeps account-wide Retry-After and serial detail ownership.
        // Register ownership before the cache emits the start of the request.
        const read: Read = { key: options.queryKey, identity, cancelled: false };
        preparing = read;
        attempted.add(identity); pendingKeys.delete(identity);
        if (neighboring) {
          neighborAttempts.set(identity, Date.now());
          if (neighborAttempts.size > 64) neighborAttempts.delete(neighborAttempts.keys().next().value!);
        }
        if (route.section !== "pull-requests") priority.startRead(read.key);
        const pageRead = route.pageId && options.queryKey[0] === "page";
        const pending = detail ? prefetchPullRequestDetail(client, route.prId!)
          : pageRead ? client.fetchQuery<unknown>({ ...options, retry: false }).then(() => {
            if (!disposed && !read.cancelled && !client.getQueryState(options.queryKey)?.isInvalidated) preparePageNavigation(route.pageId!);
          }).catch(() => {})
          : client.prefetchQuery<unknown>({ ...options, retry: false });
        if (!pending) { preparing = undefined; priority.finishRead(read.key); continue; }
        void pending.finally(() => {
          if (preparing === read) preparing = undefined;
          priority.finishRead(read.key);
          if (disposed) return;
          refreshPending(read.identity);
          if (!pendingKeys.size) priority.release();
          enqueue();
        });
        return;
      }
    }
    priority.release();
  };
  const changed = () => {
    if (disposed || (!pendingKeys.size && !preparing)) return;
    if (!visible() || !onlineManager.isOnline() || otherTransport()) {
      cancelScheduled(); yieldRead();
    }
    enqueue();
  };
  const stop = client.getQueryCache().subscribe((event) => {
    if (disposed) return;
    // Completed working sets ignore unrelated data and observer churn. Only a
    // relevant data transition or transport transition can wake this owner.
    const identity = event.query.queryHash;
    const relevant = manifest.has(identity);
    const projects = event.query.queryKey.length === 1 && event.query.queryKey[0] === "projects";
    if (event.type === "removed") {
      if (relevant) { attempted.delete(identity); refreshPending(identity); changed(); }
      return;
    }
    if (event.type !== "updated") return;
    const action = event.action;
    if (projects && ["success", "invalidate", "error"].includes(action.type)) refreshNeighbor();
    if (relevant) {
      if (action.type === "invalidate") attempted.delete(identity);
      refreshPending(identity);
    }
    const transport = ["fetch", "success", "error", "pause", "continue"].includes(action.type) &&
      !(action.type === "success" && action.manual);
    if (relevant || projects || (transport && (preparing || pendingKeys.size))) changed();
  });
  const resume = () => {
    if (!visible()) { changed(); return; }
    // Realtime owns freshness. Resume only missing/invalidated reads rather
    // than treating the passage of time as permission to trust stale data.
    for (const [identity, entry] of manifest) {
      const state = client.getQueryState(entry.query.options.queryKey);
      if (state?.isInvalidated || (state?.status !== "error" && state?.data === undefined)) attempted.delete(identity);
    }
    refreshNeighbor(); refreshPending(); changed();
  };
  const stopOnline = onlineManager.subscribe(resume);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", resume);
  if (typeof window !== "undefined") window.addEventListener("focus", resume);
  return {
    visit(href: string, hrefs: readonly string[]) {
      if (disposed) return;
      cancelScheduled();
      active = href;
      const counts = new Map<string, number>();
      visits.forEach((target) => counts.set(target, (counts.get(target) ?? 0) + 1));
      const ranked = [...new Set(hrefs)].filter((target) => target !== href).sort((a, b) =>
        (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || visits.lastIndexOf(b) - visits.lastIndexOf(a) ||
        Number(appTabRoute(a).section === "pull-requests") - Number(appTabRoute(b).section === "pull-requests"));
      available = [href, ...ranked].slice(0, RESTORED_TAB_PREPARATION_LIMIT);
      if (preparing) {
        const options = appTabPreparationQueries(client, href);
        if ((!options.length || options.some((option) => missing(option.queryKey))) &&
            !options.some((option) => hashKey(option.queryKey) === preparing!.identity)) yieldRead();
      }
      visits.push(href); if (visits.length > 32) visits.shift();
      attempted.clear(); rebuildManifest();
      // Public code has no account payload and must not wait for query transport.
      for (const target of available) void prepareAppTabSurface(target)?.catch(() => {});
      const missingNavigation = listed.some((item) => item.route.section !== "pull-requests" && actionable(item));
      if (missingNavigation) priority.acquire(); else priority.release();
      pagePreparation.visit(href, available);
      enqueue();
    },
    dispose() {
      disposed = true; cancelScheduled(); stop(); stopOnline();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", resume);
      if (typeof window !== "undefined") window.removeEventListener("focus", resume);
      neighborAttempts.clear();
      pagePreparation.dispose();
      priority.release();
      yieldRead();
    },
  };
}
