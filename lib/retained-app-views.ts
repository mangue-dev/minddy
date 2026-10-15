import type { AppTabRouteSnapshot } from "./app-tab-route-context";
import { normalizeAppTabLocation } from "./app-tab-location";

/** Maximum view count; the weighted budget also bounds large boards. */
export const RETAINED_APP_VIEW_LIMIT = 6;
export const RETAINED_APP_VIEW_BUDGET = 6;
export interface RetainedAppView {
  key: string;
  tabId: string | null;
  kind: "home" | "global-board" | "project-board" | "pages" | "pull-requests" | "feedback" | "triage" | "routines" | "objectives";
  route: AppTabRouteSnapshot;
  /** Published selection may outlive a consumed ?view= URL instruction. */
  href?: string;
}
export interface RetainedViewPolicy {
  budget: number;
  limit: number;
  /** Recent committed visits, independent of whether a view was evicted. */
  visits: readonly string[];
  cost: (view: RetainedAppView) => number;
  href?: string;
}

export function retainedAppViewKind(pathname: string): RetainedAppView["kind"] | null {
  if (pathname === "/all") return "global-board";
  if (/^\/projects\/[^/]+$/.test(pathname)) return "project-board";
  if (pathname === "/pull-requests") return "pull-requests";
  if (pathname === "/routines") return "routines";
  const section = pathname.match(/^\/projects\/[^/]+\/(pages(?:\/[^/]+)?|feedback|triage|objectives)$/)?.[1]?.split("/")[0];
  return (section as RetainedAppView["kind"] | undefined) ?? null;
}

export function isRetainedDestination(views: readonly RetainedAppView[], tabId: string | null, href: string): boolean {
  const normalized = normalizeAppTabLocation(href);
  return normalized !== null && views.some((view) => view.tabId === tabId &&
    normalized === normalizeAppTabLocation(view.href ?? `${view.route.pathname}?${view.route.search}`));
}

export function retainAppView(
  previous: RetainedAppView[],
  route: AppTabRouteSnapshot,
  tabId: string | null,
  openTabs: Set<string>,
  policy?: RetainedViewPolicy,
): RetainedAppView[] {
  const retained = previous.filter((view) => view.tabId === null || openTabs.has(view.tabId));
  const kind = retainedAppViewKind(route.pathname);
  if (!kind) return retained.length === previous.length ? previous : retained;
  const existing = retained.find((view) => (view.route.pathname === route.pathname || (kind === "pages" && view.kind === kind && view.route.projectId === route.projectId)) && (view.tabId === tabId || view.tabId === null));
  const activeRoute = existing && existing.route.pathname === route.pathname && existing.route.search === route.search ? existing.route : route;
  // An unchanged active view keeps its identity, so memoized hosts and
  // view-keyed effects do not replay for an unrelated recomputation.
  const active: RetainedAppView = existing && existing.tabId === tabId && existing.kind === kind &&
    existing.href === policy?.href && existing.route === activeRoute ? existing : {
      key: existing?.key ?? `${tabId ?? "startup"}:${route.pathname}`,
      tabId,
      kind,
      href: policy?.href,
      route: activeRoute,
    };
  const candidates = retained.filter((view) => view.key !== active.key);
  const estimate = policy?.cost ?? ((view: RetainedAppView) => view.kind === "global-board" ? 3 : 1);
  // Costs may inspect retained DOM: measure each view once per call.
  const costs = new Map<string, number>();
  const cost = (view: RetainedAppView) => {
    let value = costs.get(view.key);
    if (value === undefined) costs.set(view.key, value = estimate(view));
    return value;
  };
  const visits = policy?.visits ?? [];
  // The same bounded weight estimates reconstruction work as well as retained
  // DOM cost. Frequency alone can evict an expensive frequent board in favor
  // of several cheap views, repeatedly paying its full mount cost.
  const scores = new Map(candidates.map((view) => [view.key, Math.max(1, cost(view)) * visits.reduce((sum, id, index) =>
    sum + (id === view.tabId ? (index + 1) / visits.length : 0), 0)]));
  const score = (view: RetainedAppView) => scores.get(view.key)!;
  // Stable recency breaks equal-frequency ties. Always reserve the active view,
  // even if that single view exceeds the budget; speculation never displaces it.
  candidates.sort((a, b) => score(b) - score(a) || retained.indexOf(b) - retained.indexOf(a));
  let remaining = Math.max(0, (policy?.budget ?? RETAINED_APP_VIEW_BUDGET) - cost(active));
  const selected: RetainedAppView[] = [];
  for (const view of candidates) {
    const weight = Math.max(1, cost(view));
    if (selected.length + 1 >= (policy?.limit ?? RETAINED_APP_VIEW_LIMIT) || weight > remaining) continue;
    selected.push(view);
    remaining -= weight;
  }
  const next = [...retained.filter((view) => selected.includes(view)), active];
  return next.length === previous.length && next.every((view, index) => view === previous[index]) ? previous : next;
}
