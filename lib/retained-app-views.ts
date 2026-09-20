import type { AppTabRouteSnapshot } from "./app-tab-route-context";

/** A board is large; keep only the latest board and one previous board view. */
export const RETAINED_APP_VIEW_LIMIT = 2;
export interface RetainedAppView {
  key: string;
  tabId: string | null;
  kind: "global-board" | "project-board";
  route: AppTabRouteSnapshot;
}

export function retainedAppViewKind(pathname: string): RetainedAppView["kind"] | null {
  if (pathname === "/all") return "global-board";
  return /^\/projects\/[^/]+$/.test(pathname) ? "project-board" : null;
}

export function retainAppView(
  previous: RetainedAppView[],
  route: AppTabRouteSnapshot,
  tabId: string | null,
  openTabs: Set<string>,
): RetainedAppView[] {
  const retained = previous.filter((view) => view.tabId === null || openTabs.has(view.tabId));
  const kind = retainedAppViewKind(route.pathname);
  if (!kind) return retained;
  // Initial rendering can precede tab restoration. Adopt that same DOM once the
  // session resolves, instead of mounting the 600-card board a second time.
  const existing = retained.find((view) => view.route.pathname === route.pathname && (view.tabId === tabId || view.tabId === null));
  const active: RetainedAppView = {
    key: existing?.key ?? `${tabId ?? "startup"}:${route.pathname}`,
    tabId,
    kind,
    route: existing && existing.route.pathname === route.pathname && existing.route.search === route.search ? existing.route : route,
  };
  return [...retained.filter((view) => view.key !== active.key), active].slice(-RETAINED_APP_VIEW_LIMIT);
}
