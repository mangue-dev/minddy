import type { QueryClient } from "@tanstack/react-query";
import { appTabRoute } from "./app-tab-location";
import { prefetchPullRequestDetail } from "./prefetch-tab-destination";

/** One account-owned preparation budget per navigation, with no idle polling. */
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
  let preparing: string | undefined;

  const prepare = () => {
    cancel = undefined;
    if (disposed || !budget || client.isFetching() > 0) return;
    const counts = new Map<string, number>();
    visits.forEach((href) => counts.set(href, (counts.get(href) ?? 0) + 1));
    const candidates = [...new Set(visits)].filter((href) => href !== active && available.includes(href) && appTabRoute(href).prId)
      .sort((a, b) => (counts.get(b)! * 32 + visits.lastIndexOf(b)) - (counts.get(a)! * 32 + visits.lastIndexOf(a)));
    for (const href of candidates) {
      const prId = appTabRoute(href).prId!;
      const state = client.getQueryState(["pull-request", prId]);
      if (state?.data !== undefined && !state.isInvalidated) continue;
      const pending = prefetchPullRequestDetail(client, prId);
      if (!pending) return;
      budget = false; preparing = prId;
      void pending.finally(() => { if (preparing === prId) preparing = undefined; });
      break;
    }
  };
  const stop = client.getQueryCache().subscribe(() => {
    if (disposed) return;
    // Yield speculative transport to active work, but never cancel a detail
    // whose foreground observer has joined the normal query.
    if (preparing && client.isFetching() > 1) {
      const key = ["pull-request", preparing];
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
      visits.push(href); if (visits.length > 32) visits.shift();
      budget = true;
      cancel = schedule(prepare);
    },
    dispose() {
      disposed = true; cancel?.(); stop();
      if (preparing) {
        const key = ["pull-request", preparing];
        if (client.getQueryCache().find({ queryKey: key, exact: true })?.getObserversCount() === 0) {
          void client.cancelQueries({ queryKey: key, exact: true });
        }
      }
    },
  };
}
