import { hashKey, isCancelledError, onlineManager, type QueryClient } from "@tanstack/react-query";
import { appTabRoute } from "./app-tab-location";
import { navigationPreparationPending, navigationPreparationPriority, subscribeNavigationPreparation } from "./navigation-preparation-priority";
import { PageApiError, type PageSummary } from "./pages-api";
import { byPosition, type Page } from "./pages";
import { isDraftPage } from "./pages-draft";
import { retainedPageDocumentCost } from "./retained-page-documents";
import { fetchPageNavigationData, pageKey, pagesKey, preparePageNavigation } from "./use-pages-query";

const REFRESH_MS = 8_000;
const IDLE_MS = 50;
type Destination = { projectId: string; pageId: string };

/** Renew short preparation leases for three nearby documents, using the account's normal cache. */
export function createPageNavigationPreparation(client: QueryClient) {
  let disposed = false, available: readonly string[] = [], recent: string[] = [];
  let intent = "", dirty = true, queued = false, timerAt = 0;
  let workingSet: Destination[] = [];
  let explicitIds = new Set<string | null>();
  const bodyCosts = new WeakMap<object, 1 | 2>();
  const cost = (body: Page) => {
    let value = bodyCosts.get(body);
    if (value === undefined) { value = retainedPageDocumentCost(body); bodyCosts.set(body, value); }
    return value;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reading: Destination | undefined;
  const attempts = new Map<string, number>();
  const failures = new Map<string, number>();
  const priority = navigationPreparationPriority(client);
  const visible = () => typeof document === "undefined" || document.visibilityState !== "hidden";
  const surfaceExists = (id: string) => typeof document !== "undefined" &&
    Array.from(document.querySelectorAll("[data-page-surface-id]")).some((node) => node.getAttribute("data-page-surface-id") === id);
  const destinations = (): Destination[] => {
    if (!dirty && !workingSet.some((item) => isDraftPage(item.pageId))) return workingSet;
    dirty = false;
    const routes = available.map(appTabRoute);
    const recentRoutes = [...recent].reverse().map(appTabRoute);
    explicitIds = new Set([...recentRoutes, ...routes].map((route) => route.pageId));
    const projects = new Set(routes.filter((route) => route.section === "pages").map((route) => route.projectId));
    const known = (route: ReturnType<typeof appTabRoute>) => {
      const body = route.pageId && client.getQueryData<Page>(pageKey(route.pageId));
      return !!body && body.project_id === route.projectId && cost(body) === 1;
    };
    const explicit: Destination[] = [];
    for (const route of [...recentRoutes, ...(intent ? [appTabRoute(intent)] : []),
      ...[...routes].reverse().filter(known), ...[...routes].reverse().filter((route) => !known(route))]) {
      if (route.section !== "pages" || !route.projectId || !route.pageId || !projects.has(route.projectId) || isDraftPage(route.pageId)) continue;
      if (!explicit.some((item) => item.pageId === route.pageId)) explicit.push({ projectId: route.projectId, pageId: route.pageId });
    }
    const first = explicit[0];
    const body = first && client.getQueryData<Page>(pageKey(first.pageId));
    if (first && body?.project_id === first.projectId && cost(body) === 1) {
      const tree = client.getQueryData<PageSummary[]>(pagesKey(first.projectId));
      const siblings = tree?.filter((page) => page.project_id === first.projectId && page.parent_id === body.parent_id)
        .sort(byPosition);
      const next = siblings?.[(siblings.findIndex((page) => page.id === first.pageId)) + 1];
      if (siblings?.some((page) => page.id === first.pageId) && next && !isDraftPage(next.id) && !explicit.some((item) => item.pageId === next.id)) {
        explicit.splice(1, 0, { projectId: first.projectId, pageId: next.id });
      }
    }
    return workingSet = explicit.slice(0, 3);
  };
  const otherTransport = () => client.getQueryCache().getAll().some((query) => query.state.fetchStatus === "fetching" &&
    query.queryHash !== (reading ? hashKey(pageKey(reading.pageId)) : undefined));
  const clearTimer = () => { clearTimeout(timer); timer = undefined; timerAt = 0; };
  const yieldRead = () => {
    if (!reading) return;
    const key = pageKey(reading.pageId);
    if (client.getQueryCache().find({ queryKey: key, exact: true })?.getObserversCount()) return;
    reading = undefined;
    priority.release();
    void client.cancelQueries({ queryKey: key, exact: true });
  };
  const dueAt = (item: Destination, explicit: boolean) => {
    if (isDraftPage(item.pageId) || surfaceExists(item.pageId)) return Infinity;
    const state = client.getQueryState<Page>(pageKey(item.pageId));
    const body = state?.data;
    // Open tabs already have their initial read owner. Only one adjacent body
    // may be fetched speculatively before its type and size are known.
    if (!body) return explicit || attempts.has(item.pageId) ? Infinity : 0;
    if (body.id !== item.pageId || body.project_id !== item.projectId || cost(body) !== 1) return Infinity;
    return Math.max(state?.dataUpdatedAt ?? 0, attempts.get(item.pageId) ?? 0) + REFRESH_MS;
  };
  const schedule = () => {
    if (disposed || reading || !visible() || !onlineManager.isOnline() || otherTransport() || navigationPreparationPending(client)) { clearTimer(); return; }
    const items = destinations();
    const due = Math.min(...items.map((item) => Math.max(dueAt(item, explicitIds.has(item.pageId)), failures.get(item.pageId) ?? 0)));
    if (!Number.isFinite(due)) { clearTimer(); return; }
    const next = Math.max(Date.now() + IDLE_MS, due);
    if (timer && timerAt <= next) return;
    clearTimer(); timerAt = next; timer = setTimeout(refresh, next - Date.now());
  };
  const refresh = () => {
    timer = undefined; timerAt = 0;
    if (disposed || reading || !visible() || !onlineManager.isOnline() || otherTransport() || navigationPreparationPending(client)) return;
    const item = destinations().find((target) => Math.max(dueAt(target, explicitIds.has(target.pageId)), failures.get(target.pageId) ?? 0) <= Date.now());
    if (!item) { schedule(); return; }
    reading = item;
    attempts.set(item.pageId, Date.now());
    const key = pageKey(item.pageId);
    priority.acquire(); priority.startRead(key);
    void client.fetchQuery({ queryKey: key, queryFn: ({ signal }) => fetchPageNavigationData(client, item.projectId, item.pageId, signal), staleTime: 0, retry: false }).then(() => {
      const state = client.getQueryState(key);
      if (!disposed && reading === item && state?.status === "success" && !state.isInvalidated) preparePageNavigation(item.pageId);
      failures.delete(item.pageId);
    }, (error: unknown) => {
      if (isCancelledError(error)) return;
      const terminal = error instanceof PageApiError && [401, 403, 404, 429].includes(error.status);
      failures.set(item.pageId, terminal ? Infinity : Date.now() + 30_000);
    }).finally(() => {
      if (reading === item) { reading = undefined; priority.release(); }
      schedule();
    });
  };
  const requestSchedule = () => {
    if (disposed || queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; if (!disposed) schedule(); });
  };
  const changed = () => {
    if (disposed) return;
    if (!visible() || !onlineManager.isOnline() || otherTransport()) yieldRead();
    requestSchedule();
  };
  const stopCache = client.getQueryCache().subscribe((event) => {
    const relevant = ["page", "pages"].includes(String(event.query.queryKey[0]));
    if (event.type === "updated") {
      if (relevant) dirty = true;
      if (event.action.type === "success" && !event.action.manual && event.query.queryKey[0] === "page") failures.delete(String(event.query.queryKey[1]));
      if (relevant || (["fetch", "success", "error", "pause", "continue"].includes(event.action.type) &&
        !(event.action.type === "success" && event.action.manual))) changed();
    } else if (relevant && ["removed", "observerAdded", "observerRemoved"].includes(event.type)) {
      dirty = true; changed();
    }
  });
  const stopPriority = subscribeNavigationPreparation(client, requestSchedule);
  const stopOnline = onlineManager.subscribe(changed);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", changed);
  return {
    visit(href: string, hrefs: readonly string[]) {
      if (disposed) return;
      available = hrefs; dirty = true;
      if (intent && !available.includes(intent)) intent = "";
      if (appTabRoute(href).section === "pages") { recent = recent.filter((item) => item !== href).concat(href).slice(-3); }
      const retained = new Set(destinations().map((item) => item.pageId));
      for (const id of attempts.keys()) if (!retained.has(id)) { attempts.delete(id); failures.delete(id); }
      if (reading && !retained.has(reading.pageId)) yieldRead();
      changed();
    },
    prioritize(href: string) {
      if (disposed || intent === href || !available.includes(href) || !appTabRoute(href).pageId) return;
      intent = href; dirty = true; requestSchedule();
    },
    dispose() {
      disposed = true; clearTimer(); stopCache(); stopPriority(); stopOnline(); yieldRead(); priority.release();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", changed);
      attempts.clear(); failures.clear(); recent = []; available = [];
    },
  };
}
