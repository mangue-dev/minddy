import { hashKey, type QueryClient } from "@tanstack/react-query";
import { prepareAppTabSurface } from "./app-tab-surfaces";
import { preparePageNavigation } from "./use-pages-query";
import { appTabRoute } from "./app-tab-location";
import { appTabPreparationQueries, appTabPreparationQuery, prefetchPullRequestDetail } from "./prefetch-tab-destination";
import { navigationPreparationPriority } from "./navigation-preparation-priority";
import { allPullRequestsQueryOptions } from "./use-agent-runs";
import { prActivityPreparationQueries } from "./pr-activity-query";
import { createPageNavigationPreparation } from "./page-navigation-preparation";
import { adjacentProjectDestination } from "./project-navigation-working-set";

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

/** Prepare a bounded working set after foreground reads, without idle polling. */
export function createPrTabPreparation(
  client: QueryClient,
  schedule: (work: () => void) => () => void = (work) => {
    const timer = setTimeout(() => {
      if (typeof requestIdleCallback === "function") idle = requestIdleCallback(work);
      else work();
    }, 50);
    let idle: number | undefined;
    return () => { clearTimeout(timer); if (idle !== undefined) cancelIdleCallback(idle); };
  },
) {
  const pagePreparation = createPageNavigationPreparation(client);
  const visits: string[] = [];
  let available: readonly string[] = [];
  let active = "", budget = 0, neighborBudget = 0, disposed = false;
  let neighborConsidered = false;
  const neighborAttempts = new Map<string, number>();
  let detailAttempted = false;
  let prDestination: string | undefined;
  const attempted = new Set<string>();
  const destinations = new Set<string>();
  let cancel: (() => void) | undefined;
  const cancelScheduled = () => { cancel?.(); cancel = undefined; };
  let preparing: readonly unknown[] | undefined;
  const priority = navigationPreparationPriority(client);
  const otherTransport = (exceptOwn = false) => {
    const auxiliary = new Set(recentActivityQueries(client).map((options) => hashKey(options.queryKey)));
    return client.getQueryCache().getAll().some((query) => query.state.fetchStatus === "fetching" &&
      !(exceptOwn && preparing && query.queryHash === hashKey(preparing)) &&
      !(auxiliary.has(query.queryHash) && !query.isActive()));
  };

  const prepare = () => {
    cancel = undefined;
    if (disposed || (!budget && !neighborBudget) || preparing || otherTransport()) return;
    const counts = new Map<string, number>();
    visits.forEach((href) => counts.set(href, (counts.get(href) ?? 0) + 1));
    // Frequent visits win. Among unvisited destinations, boards/documents must
    // not wait behind old PR tabs; prepare at most one entire PR destination.
    const neighbor = adjacentProjectDestination(client, active, visits, available);
    if (neighbor && !neighborConsidered) { neighborBudget = 7; neighborConsidered = true; }
    const openCandidates = [...new Set([...visits, ...available])].filter((href) => href !== active && href !== neighbor && available.includes(href) && (appTabPreparationQuery(client, href) || appTabRoute(href).section === "home"))
      .sort((a, b) => ((counts.get(b) ?? 0) * 32 + visits.lastIndexOf(b)) - ((counts.get(a) ?? 0) * 32 + visits.lastIndexOf(a)) ||
        Number(appTabRoute(a).section === "pull-requests") - Number(appTabRoute(b).section === "pull-requests"));
    const candidates = [...openCandidates];
    if (neighbor) {
      const optionalPr = candidates.findIndex((href) => appTabRoute(href).section === "pull-requests" && !counts.get(href));
      candidates.splice(optionalPr < 0 ? candidates.length : optionalPr, 0, neighbor);
    }
    const firstPage = candidates.find((href) => appTabRoute(href).pageId);
    if (firstPage) pagePreparation.prioritize(firstPage);
    for (const href of candidates) {
      const route = appTabRoute(href);
      const neighboring = href === neighbor;
      const optionsForDestination = appTabPreparationQueries(client, href);
      void prepareAppTabSurface(href)?.catch(() => {});
      if (optionsForDestination.every((options) => {
        const state = client.getQueryState(options.queryKey);
        return state?.data !== undefined && !state.isInvalidated && state.status !== "error";
      })) continue;
      if (route.section === "pull-requests") {
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
      if (!neighboring && !destinations.has(href) && destinations.size >= 3) continue;
      if (!neighboring) destinations.add(href);
      for (const options of optionsForDestination) {
        if ((neighboring ? neighborBudget : budget) <= 0) break;
        const identity = JSON.stringify(options.queryKey);
        if (attempted.has(identity)) continue;
        const state = client.getQueryState(options.queryKey);
        if (state?.data !== undefined && !state.isInvalidated && state.status !== "error") continue;
        if (neighboring && Date.now() - (neighborAttempts.get(identity) ?? -Infinity) < 30_000) continue;
        const detail = options.queryKey[0] === "pull-request";
        if (detail && detailAttempted) continue;
        if (detail) detailAttempted = true;
        attempted.add(identity);
        if (neighboring) {
          neighborBudget--; neighborAttempts.set(identity, Date.now());
          if (neighborAttempts.size > 64) neighborAttempts.delete(neighborAttempts.keys().next().value!);
        } else budget--;
        // Set ownership before the cache emits the start of the request.
        preparing = options.queryKey;
        const key = preparing;
        if (route.section !== "pull-requests") priority.startRead(key);
        const pageRead = route.pageId && options.queryKey[0] === "page";
        const pending = detail ? prefetchPullRequestDetail(client, route.prId!)
          : pageRead ? client.fetchQuery<unknown>({ ...options, retry: false }).then(() => {
            if (!disposed && !client.getQueryState(options.queryKey)?.isInvalidated) preparePageNavigation(route.pageId!);
          }).catch(() => {})
          : client.prefetchQuery<unknown>({ ...options, retry: false });
        if (!pending) { preparing = undefined; priority.finishRead(key); continue; }
        void pending.finally(() => {
          if (preparing === key) preparing = undefined;
          priority.finishRead(key);
          if (!disposed && budget === 0 && neighborBudget === 0) priority.release();
          if (!disposed && (budget || neighborBudget) && !cancel && !otherTransport()) cancel = schedule(prepare);
        });
        return;
      }
    }
    budget = 0; neighborBudget = 0;
    priority.release();
  };
  const stop = client.getQueryCache().subscribe(() => {
    if (disposed) return;
    // Yield speculative transport to active work, but never cancel a detail
    // whose foreground observer has joined the normal query.
    if (preparing && otherTransport(true)) {
      const key = preparing;
      if (client.getQueryCache().find({ queryKey: key, exact: true })?.getObserversCount() === 0) {
        preparing = undefined;
        void client.cancelQueries({ queryKey: key, exact: true });
      }
    }
    if ((budget || neighborBudget) && !cancel && !otherTransport()) cancel = schedule(prepare);
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
      // Three open destinations/twelve reads plus one authorized neighboring
      // project's seven normal reads. Every request still uses the shared slot.
      attempted.clear(); destinations.clear(); detailAttempted = false; prDestination = undefined; budget = 12;
      const neighbor = adjacentProjectDestination(client, active, visits, available);
      neighborBudget = neighbor ? 7 : 0; neighborConsidered = !!neighbor;
      const missingNavigation = [...hrefs, ...(neighbor ? [neighbor] : [])].some((target) => target !== href && appTabRoute(target).section !== "pull-requests" &&
        appTabPreparationQueries(client, target).some((options) => {
          const state = client.getQueryState(options.queryKey);
          return state?.data === undefined || state.isInvalidated || state.status === "error";
        }));
      if (missingNavigation) priority.acquire(); else priority.release();
      cancelScheduled();
      cancel = schedule(prepare);
      pagePreparation.visit(href, hrefs);
    },
    dispose() {
      disposed = true; cancel?.(); stop();
      neighborAttempts.clear();
      pagePreparation.dispose();
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
