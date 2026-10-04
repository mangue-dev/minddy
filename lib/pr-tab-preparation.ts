import type { QueryClient } from "@tanstack/react-query";
import { prepareAppTabSurface } from "./app-tab-surfaces";
import { preparePageNavigation } from "./use-pages-query";
import { appTabRoute } from "./app-tab-location";
import { appTabPreparationQuery, prefetchPullRequestDetail } from "./prefetch-tab-destination";

/** The existing account preparation owner ranks all common destinations.
 * One primary read per navigation, with active-work cancellation and no polling. */
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
  let active = "", budget = false, disposed = false;
  let cancel: (() => void) | undefined;
  let preparing: readonly unknown[] | undefined;

  const prepare = () => {
    cancel = undefined;
    if (disposed || !budget || client.isFetching() > 0) return;
    const counts = new Map<string, number>();
    visits.forEach((href) => counts.set(href, (counts.get(href) ?? 0) + 1));
    const candidates = [...new Set(visits)].filter((href) => href !== active && available.includes(href) && appTabPreparationQuery(client, href))
      .sort((a, b) => (counts.get(b)! * 32 + visits.lastIndexOf(b)) - (counts.get(a)! * 32 + visits.lastIndexOf(a)));
    for (const href of candidates) {
      const options = appTabPreparationQuery(client, href)!;
      const state = client.getQueryState(options.queryKey);
      if (state?.data !== undefined && !state.isInvalidated) continue;
      const route = appTabRoute(href);
      if (route.pageId) preparePageNavigation(route.pageId);
      // The final consumer owns the data and its reconciliation rules. Only
      // one missing/invalidated primary read consumes this navigation budget.
      const pending = route.prId ? prefetchPullRequestDetail(client, route.prId)
        : client.prefetchQuery<unknown>({ ...options, retry: false });
      if (!pending) return;
      void prepareAppTabSurface(href)?.catch(() => {});
      budget = false; preparing = options.queryKey;
      const key = preparing;
      void pending.finally(() => { if (preparing === key) preparing = undefined; });
      break;
    }
  };
  const stop = client.getQueryCache().subscribe(() => {
    if (disposed) return;
    // Yield speculative transport to active work, but never cancel a detail
    // whose foreground observer has joined the normal query.
    if (preparing && client.isFetching() > 1) {
      const key = preparing;
      if (client.getQueryCache().find({ queryKey: key, exact: true })?.getObserversCount() === 0) {
        void client.cancelQueries({ queryKey: key, exact: true });
      }
    }
    if (budget && !cancel && client.isFetching() === 0) cancel = schedule(prepare);
  });
  return {
    visit(href: string, hrefs: readonly string[]) {
      if (disposed) return;
      cancel?.(); cancel = undefined;
      active = href; available = hrefs;
      if (preparing && client.getQueryCache().find({ queryKey: preparing, exact: true })?.getObserversCount() === 0) {
        const target = appTabPreparationQuery(client, href)?.queryKey;
        if (JSON.stringify(target) !== JSON.stringify(preparing)) void client.cancelQueries({ queryKey: preparing, exact: true });
      }
      visits.push(href); if (visits.length > 32) visits.shift();
      budget = true;
      cancel = schedule(prepare);
    },
    dispose() {
      disposed = true; cancel?.(); stop();
      if (preparing) {
        const key = preparing;
        if (client.getQueryCache().find({ queryKey: key, exact: true })?.getObserversCount() === 0) {
          void client.cancelQueries({ queryKey: key, exact: true });
        }
      }
    },
  };
}
