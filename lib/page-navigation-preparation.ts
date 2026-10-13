import { hashKey, isCancelledError, onlineManager, type QueryClient } from "@tanstack/react-query";
import { appTabRoute } from "./app-tab-location";
import { navigationPreparationPending, navigationPreparationPriority, subscribeNavigationPreparation } from "./navigation-preparation-priority";
import { PageApiError, type PageSummary } from "./pages-api";
import { byPosition, type Page } from "./pages";
import { isDraftPage } from "./pages-draft";
import { retainedPageDocumentCost } from "./retained-page-documents";
import { fetchPageNavigationData, pageKey, pagesKey, preparePageNavigation } from "./use-pages-query";

const REFRESH_MS = 8_000;
const IDLE_MS = 500;
type Destination = { projectId: string; pageId: string };

/** Renew short preparation leases for three nearby documents, using the account's normal cache. */
export function createPageNavigationPreparation(client: QueryClient) {
  let disposed = false, available: readonly string[] = [], recent: string[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reading: Destination | undefined;
  const attempts = new Map<string, number>();
  const failures = new Map<string, number>();
  const priority = navigationPreparationPriority(client);
  const visible = () => typeof document === "undefined" || document.visibilityState !== "hidden";
  const surfaceExists = (id: string) => typeof document !== "undefined" &&
    Array.from(document.querySelectorAll("[data-page-surface-id]")).some((node) => node.getAttribute("data-page-surface-id") === id);
  const destinations = (): Destination[] => {
    const projects = new Set(available.map(appTabRoute).filter((route) => route.section === "pages").map((route) => route.projectId));
    const explicit: Destination[] = [];
    for (const href of [...recent].reverse().concat([...available].reverse())) {
      const route = appTabRoute(href);
      if (route.section !== "pages" || !route.projectId || !route.pageId || !projects.has(route.projectId) || isDraftPage(route.pageId)) continue;
      if (!explicit.some((item) => item.pageId === route.pageId)) explicit.push({ projectId: route.projectId, pageId: route.pageId });
    }
    const first = explicit[0];
    const body = first && client.getQueryData<Page>(pageKey(first.pageId));
    if (first && body?.project_id === first.projectId && retainedPageDocumentCost(body) === 1) {
      const tree = client.getQueryData<PageSummary[]>(pagesKey(first.projectId));
      const siblings = tree?.filter((page) => page.project_id === first.projectId && page.parent_id === body.parent_id)
        .sort(byPosition);
      const next = siblings?.[(siblings.findIndex((page) => page.id === first.pageId)) + 1];
      if (siblings?.some((page) => page.id === first.pageId) && next && !isDraftPage(next.id) && !explicit.some((item) => item.pageId === next.id)) {
        explicit.splice(1, 0, { projectId: first.projectId, pageId: next.id });
      }
    }
    return explicit.slice(0, 3);
  };
  const otherTransport = () => client.getQueryCache().getAll().some((query) => query.state.fetchStatus === "fetching" &&
    query.queryHash !== (reading ? hashKey(pageKey(reading.pageId)) : undefined));
  const clearTimer = () => { clearTimeout(timer); timer = undefined; };
  const yieldRead = () => {
    if (!reading) return;
    const key = pageKey(reading.pageId);
    if (client.getQueryCache().find({ queryKey: key, exact: true })?.getObserversCount()) return;
    reading = undefined;
    priority.release();
    void client.cancelQueries({ queryKey: key, exact: true });
  };
  const dueAt = (item: Destination, explicit: boolean) => {
    if (surfaceExists(item.pageId)) return Infinity;
    const state = client.getQueryState<Page>(pageKey(item.pageId));
    const body = state?.data;
    // Open tabs already have their initial read owner. Only one adjacent body
    // may be fetched speculatively before its type and size are known.
    if (!body) return explicit || attempts.has(item.pageId) ? Infinity : 0;
    if (body.id !== item.pageId || body.project_id !== item.projectId || retainedPageDocumentCost(body) !== 1) return Infinity;
    return Math.max(state?.dataUpdatedAt ?? 0, attempts.get(item.pageId) ?? 0) + REFRESH_MS;
  };
  const schedule = () => {
    clearTimer();
    if (disposed || reading || !visible() || !onlineManager.isOnline() || otherTransport() || navigationPreparationPending(client)) return;
    const items = destinations();
    const explicitIds = new Set([...recent, ...available].map(appTabRoute).map((route) => route.pageId));
    const due = Math.min(...items.map((item) => Math.max(dueAt(item, explicitIds.has(item.pageId)), failures.get(item.pageId) ?? 0)));
    if (Number.isFinite(due)) timer = setTimeout(refresh, Math.max(IDLE_MS, due - Date.now()));
  };
  const refresh = () => {
    timer = undefined;
    if (disposed || reading || !visible() || !onlineManager.isOnline() || otherTransport() || navigationPreparationPending(client)) return;
    const explicitIds = new Set([...recent, ...available].map(appTabRoute).map((route) => route.pageId));
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
  const changed = () => {
    if (disposed) return;
    if (!visible() || !onlineManager.isOnline() || otherTransport()) yieldRead();
    schedule();
  };
  const stopCache = client.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "success" && !event.action.manual && event.query.queryKey[0] === "page") failures.delete(String(event.query.queryKey[1]));
    changed();
  });
  const stopPriority = subscribeNavigationPreparation(client, schedule);
  const stopOnline = onlineManager.subscribe(changed);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", changed);
  return {
    visit(href: string, hrefs: readonly string[]) {
      if (disposed) return;
      available = hrefs;
      if (appTabRoute(href).section === "pages") { recent = recent.filter((item) => item !== href).concat(href).slice(-3); }
      const retained = new Set(destinations().map((item) => item.pageId));
      for (const id of attempts.keys()) if (!retained.has(id)) { attempts.delete(id); failures.delete(id); }
      if (reading && !retained.has(reading.pageId)) yieldRead();
      changed();
    },
    dispose() {
      disposed = true; clearTimer(); stopCache(); stopPriority(); stopOnline(); yieldRead(); priority.release();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", changed);
      attempts.clear(); failures.clear(); recent = []; available = [];
    },
  };
}
