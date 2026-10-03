import type { AppTabRouteSnapshot } from "./app-tab-route-context";
import { normalizeAppTabLocation } from "./app-tab-location";

/** Maximum view count; the weighted budget also bounds large boards. */
export const RETAINED_APP_VIEW_LIMIT = 6;
export const RETAINED_APP_VIEW_BUDGET = 6;
export interface RetainedAppView {
  key: string;
  tabId: string | null;
  kind: "global-board" | "project-board" | "pages" | "pull-requests" | "feedback" | "triage";
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
  const section = pathname.match(/^\/projects\/[^/]+\/(pages(?:\/[^/]+)?|feedback|triage)$/)?.[1]?.split("/")[0];
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
  if (!kind) return retained;
  const existing = retained.find((view) => (view.route.pathname === route.pathname || (kind === "pages" && view.kind === kind && view.route.projectId === route.projectId)) && (view.tabId === tabId || view.tabId === null));
  const active: RetainedAppView = {
    key: existing?.key ?? `${tabId ?? "startup"}:${route.pathname}`,
    tabId,
    kind,
    href: policy?.href,
    route: existing && existing.route.pathname === route.pathname && existing.route.search === route.search ? existing.route : route,
  };
  const candidates = retained.filter((view) => view.key !== active.key);
  const cost = policy?.cost ?? ((view: RetainedAppView) => view.kind === "global-board" ? 3 : 1);
  const visits = policy?.visits ?? [];
  const score = (view: RetainedAppView) => visits.reduce((sum, id, index) =>
    sum + (id === view.tabId ? (index + 1) / visits.length : 0), 0);
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
  return [...retained.filter((view) => selected.includes(view)), active];
}
