import type { AppTabRouteSnapshot } from "./app-tab-route-context";
import { normalizeAppTabLocation } from "./app-tab-location";

/** Maximum view count; the weighted budget also bounds large boards. */
export const RETAINED_APP_VIEW_LIMIT = 6;
export const RETAINED_APP_VIEW_BUDGET = 6;
const SMALL_PAGE_NODES = new Set(["doc", "paragraph", "heading", "text", "hardBreak", "horizontalRule", "blockquote", "bulletList", "orderedList", "listItem", "taskList", "taskItem"]);

/** Small documents need less retained DOM than a 200-card board unit.
 * Inspect only bounded, already-owned query data; unknown and large documents
 * keep the conservative Page weight. This does not certify read freshness. */
export function retainedPageCost(page: { content: unknown; database_schema?: unknown } | undefined): number {
  if (!page || page.database_schema != null || !page.content || typeof page.content !== "object" ||
    !("type" in page.content) || page.content.type !== "doc") return 2;
  const pending: unknown[] = [page.content];
  let nodes = 0;
  let characters = 0;
  while (pending.length) {
    if (++nodes > 200) return 2;
    const node = pending.pop();
    if (!node || typeof node !== "object" || !("type" in node) || typeof node.type !== "string" || !SMALL_PAGE_NODES.has(node.type)) return 2;
    if ("text" in node) {
      if (typeof node.text !== "string") return 2;
      characters += node.text.length;
      if (characters > 25_000) return 2;
    }
    if ("content" in node) {
      if (!Array.isArray(node.content) || node.content.length + pending.length + nodes > 200) return 2;
      pending.push(...node.content);
    }
  }
  return 1;
}
export interface RetainedAppView {
  key: string;
  tabId: string | null;
  kind: "home" | "global-board" | "project-board" | "pages" | "pull-requests" | "feedback" | "triage";
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
  // The same bounded weight estimates reconstruction work as well as retained
  // DOM cost. Frequency alone can evict an expensive frequent board in favor
  // of several cheap views, repeatedly paying its full mount cost.
  const score = (view: RetainedAppView) => Math.max(1, cost(view)) * visits.reduce((sum, id, index) =>
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
