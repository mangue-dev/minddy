import type { QueryClient } from "@tanstack/react-query";
import { prepareAppTabSurface } from "./app-tab-surfaces";
import { preparePageNavigation } from "./use-pages-query";
import { appTabRoute } from "./app-tab-location";
import { appTabPreparationQueries, appTabPreparationQuery, prefetchPullRequestDetail } from "./prefetch-tab-destination";
import { navigationPreparationPriority } from "./navigation-preparation-priority";
import { allPullRequestsQueryOptions } from "./use-agent-runs";
import { prActivityPreparationQueries } from "./pr-activity-query";

/** Recent visible detail activities precede optional lists for old pinned PRs. */
function missingRecentActivity(client: QueryClient): boolean {
  const list = client.getQueryData<{ pullRequests: { prId: string; pr_state: string }[] }>(allPullRequestsQueryOptions().queryKey);
  const recent = [...new Set((list?.pullRequests ?? []).filter((pr) => ["open", "draft"].includes(pr.pr_state)).map((pr) => pr.prId))].slice(0, 5);
  return recent.some((id) => client.getQueryState<{ pr: unknown }>(["pull-request", id])?.data?.pr &&
    prActivityPreparationQueries(id).some((options) => {
      const state = client.getQueryState(options.queryKey);
      return state?.status !== "error" && (state?.data === undefined || state.isInvalidated);
    }));
}

/** Prepare a bounded working set after foreground reads, without idle polling. */
export function createPrTabPreparation(
  client: QueryClient,
  schedule: (work: () => void) => () => void = (work) => {
    const timer = setTimeout(() => {
      if (typeof requestIdleCallback === "function") idle = requestIdleCallback(work);
      else work();
    }, 300);
    let idle: number | undefined;
    return () => { clearTimeout(timer); if (idle !== undefined) cancelIdleCallback(idle); };
  },
) {
  const visits: string[] = [];
  let available: readonly string[] = [];
  let active = "", budget = 0, disposed = false;
  let detailAttempted = false;
  let prDestination: string | undefined;
  const attempted = new Set<string>();
  const destinations = new Set<string>();
  let cancel: (() => void) | undefined;
  const cancelScheduled = () => { cancel?.(); cancel = undefined; };
  let preparing: readonly unknown[] | undefined;
  const priority = navigationPreparationPriority(client);

  const prepare = () => {
    cancel = undefined;
    if (disposed || !budget || client.isFetching() > 0) return;
    const counts = new Map<string, number>();
    visits.forEach((href) => counts.set(href, (counts.get(href) ?? 0) + 1));
    // Frequent visits win. Among unvisited destinations, boards/documents must
    // not wait behind old PR tabs; prepare at most one entire PR destination.
    const candidates = [...new Set([...visits, ...available])].filter((href) => href !== active && available.includes(href) && (appTabPreparationQuery(client, href) || appTabRoute(href).section === "home"))
      .sort((a, b) => ((counts.get(b) ?? 0) * 32 + visits.lastIndexOf(b)) - ((counts.get(a) ?? 0) * 32 + visits.lastIndexOf(a)) ||
        Number(appTabRoute(a).section === "pull-requests") - Number(appTabRoute(b).section === "pull-requests"));
    for (const href of candidates) {
      const route = appTabRoute(href);
      if (route.section === "pull-requests") {
        const loaded = appTabPreparationQueries(client, href).every((options) => {
          const state = client.getQueryState(options.queryKey);
          return state?.data !== undefined && !state.isInvalidated && state.status !== "error";
        });
        if (loaded) { void prepareAppTabSurface(href)?.catch(() => {}); continue; }
        const missingNavigation = candidates.some((target) => appTabRoute(target).section !== "pull-requests" &&
          appTabPreparationQueries(client, target).some((options) => {
            const state = client.getQueryState(options.queryKey);
            return state?.data === undefined || state.isInvalidated || state.status === "error";
          }));
        if (!missingNavigation) priority.release();
        // Cache completion events resume this pass after the bounded activity
        // owner, without starting another timer or abandoning deferred lists.
        if (!missingNavigation && missingRecentActivity(client)) return;
        if (prDestination && prDestination !== href) continue;
        prDestination = href;
      }
      if (!destinations.has(href) && destinations.size >= 3) continue;
      destinations.add(href);
      void prepareAppTabSurface(href)?.catch(() => {});
      for (const options of appTabPreparationQueries(client, href)) {
        if (budget <= 0) { priority.release(); return; }
        const identity = JSON.stringify(options.queryKey);
        if (attempted.has(identity)) continue;
        const state = client.getQueryState(options.queryKey);
        if (state?.data !== undefined && !state.isInvalidated && state.status !== "error") continue;
        const detail = options.queryKey[0] === "pull-request";
        if (detail && detailAttempted) continue;
        if (detail) detailAttempted = true;
        attempted.add(identity);
        budget--;
        // Set ownership before the cache emits the start of the request.
        preparing = options.queryKey;
        const key = preparing;
        const startedAt = Date.now();
        const pending = detail ? prefetchPullRequestDetail(client, route.prId!)
          : client.prefetchQuery<unknown>({ ...options, retry: false });
        if (!pending) { preparing = undefined; continue; }
        void pending.finally(() => {
          if (preparing === key) preparing = undefined;
          const state = client.getQueryState(options.queryKey);
          if (!disposed && route.pageId && state?.status === "success" && !state.isInvalidated && state.dataUpdatedAt >= startedAt && options.queryKey[0] === "page") preparePageNavigation(route.pageId);
          if (!disposed && budget === 0) priority.release();
          if (!disposed && budget && !cancel && client.isFetching() === 0) cancel = schedule(prepare);
        });
        return;
      }
    }
    budget = 0;
    priority.release();
  };
  const stop = client.getQueryCache().subscribe(() => {
    if (disposed) return;
    // Yield speculative transport to active work, but never cancel a detail
    // whose foreground observer has joined the normal query.
    if (preparing && client.isFetching() > 1) {
      const key = preparing;
      if (client.getQueryCache().find({ queryKey: key, exact: true })?.getObserversCount() === 0) {
        preparing = undefined;
        void client.cancelQueries({ queryKey: key, exact: true });
      }
    }
    if (budget && !cancel && client.isFetching() === 0) cancel = schedule(prepare);
  });
  return {
    visit(href: string, hrefs: readonly string[]) {
      if (disposed) return;
      cancelScheduled();
      active = href; available = hrefs;
      if (preparing && client.getQueryCache().find({ queryKey: preparing, exact: true })?.getObserversCount() === 0) {
        const target = appTabPreparationQuery(client, href)?.queryKey;
        if (JSON.stringify(target) !== JSON.stringify(preparing)) void client.cancelQueries({ queryKey: preparing, exact: true });
      }
      visits.push(href); if (visits.length > 32) visits.shift();
      // At most three destinations and twelve sequential reads per navigation.
      // Complete a board's prerequisites without flooding startup transport.
      attempted.clear(); destinations.clear(); detailAttempted = false; prDestination = undefined; budget = 12;
      const missingNavigation = hrefs.some((target) => target !== href && appTabRoute(target).section !== "pull-requests" &&
        appTabPreparationQueries(client, target).some((options) => {
          const state = client.getQueryState(options.queryKey);
          return state?.data === undefined || state.isInvalidated || state.status === "error";
        }));
      if (missingNavigation) priority.acquire(); else priority.release();
      cancelScheduled();
      cancel = schedule(prepare);
    },
    dispose() {
      disposed = true; cancel?.(); stop();
      priority.release();
      if (preparing) {
        const key = preparing;
        if (client.getQueryCache().find({ queryKey: key, exact: true })?.getObserversCount() === 0) {
          void client.cancelQueries({ queryKey: key, exact: true });
        }
      }
    },
  };
}
