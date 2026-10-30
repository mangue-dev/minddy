"use client";

import { expandProjectSegment, expandRef } from "@/lib/ref-registry";
import { projectSegmentFromPath } from "@/lib/project-id-from-path";
import { Activity, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { appTabSurfaceLoaders, preparedBoardSurface, preparedCollectionSurface } from "@/lib/app-tab-surfaces";
import { usePathname, useSearchParams } from "next/navigation";
import { AppTabNavigationScope, useAppTabs, useOptionalAppTabNavigation, useOptionalAppTabs } from "@/lib/app-tabs-context";
import { AppTabRouteProvider } from "@/lib/app-tab-route-context";
import { nextReadActivationSequence } from "@/lib/read-activation-sequence";
import { normalizeAppTabLocation } from "@/lib/app-tab-location";
import { isRetainedDestination, RETAINED_APP_VIEW_LIMIT, retainAppView, retainedAppViewBudget, retainedAppViewKind, type RetainedAppView } from "@/lib/retained-app-views";
import { RetainedBoardTitle } from "./retained-board-title";
import { BoardLoadingSkeleton } from "./board-loading-skeleton";
import { useRetainedBoardScroll } from "@/lib/use-retained-board-scroll";
import { useColdBoardPrefetch } from "@/lib/use-cold-board-prefetch";
import { createRetainedBoardData } from "@/lib/retained-board-data";
import { refreshRetainedBoard, retainedBoardReadFailure, retainedBoardReadState, subscribeRetainedBoardReadState } from "@/lib/retained-board-read-state";
import { readFailureKind } from "@/lib/read-failure";
import { ReadFailureNotice } from "./read-failure-notice";
import { useTranslations } from "next-intl";
import { QueryReadBoundary } from "./query-read-boundary";
import { retainPageDocuments, retainedPageDocumentCost } from "@/lib/retained-page-documents";
import { isDraftPage } from "@/lib/pages-draft";
import { usePendingNavigation } from "@/lib/pending-navigation";
import { RouteLoadingSkeleton } from "./route-loading-skeleton";

const GlobalBoard = dynamic(() => appTabSurfaceLoaders["global-board"]().then((module) => module.GlobalBoard), { loading: () => <BoardLoadingSkeleton /> });
const ProjectBoard = dynamic(appTabSurfaceLoaders["project-board"], { loading: () => <BoardLoadingSkeleton /> });

const Pages = dynamic(() => appTabSurfaceLoaders.pages().then((module) => module.PagesShell));
const PullRequests = dynamic(appTabSurfaceLoaders["pull-requests"]);
const Feedback = dynamic(() => appTabSurfaceLoaders.feedback().then((module) => module.FeedbackTeamPage));
const Triage = dynamic(appTabSurfaceLoaders.triage);
const Home = dynamic(appTabSurfaceLoaders.home);
const Routines = dynamic(appTabSurfaceLoaders.routines);
const Objectives = dynamic(appTabSurfaceLoaders.objectives);

function BoardReadFailure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useTranslations("Board");
  const kind = readFailureKind(error);
  return <ReadFailureNotice error={error} className="h-full" onRetry={onRetry} retryLabel={t("readRetry")}
    message={kind === "forbidden" ? t("readErrorForbidden") : kind === "notFound" ? t("readErrorNotFound") : t("readError")} />;
}

const RetainedBoard = memo(function RetainedBoard({ view, active, roots }: { view: RetainedAppView; active: boolean; roots: Map<string, HTMLElement> }) {
  // Prepared public code can render synchronously. Fix the renderer at mount:
  // upgrading a mounted dynamic wrapper would discard its DOM and local state.
  // Keep activation from replaying unchanged board props. Account query and
  // route-context updates still reach their own subscribers below this memo.
  const [BoardSurface] = useState(() => memo(preparedBoardSurface(view.kind) ?? (view.kind === "global-board" ? GlobalBoard : ProjectBoard)));
  const [CollectionSurface] = useState(() => memo(preparedCollectionSurface(view.kind) ?? (view.kind === "routines" ? Routines : Objectives)));
  const activation = useRef<{ active: boolean; sequence: number } | null>(null);
  if (!activation.current || (active && !activation.current.active)) {
    activation.current = { active, sequence: nextReadActivationSequence() };
  }
  activation.current.active = active;
  const scroll = useRetainedBoardScroll(active);
  const root = scroll.ref;
  // The host lives outside Activity, so hidden views stay registered.
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    roots.set(view.key, node);
    return () => { if (roots.get(view.key) === node) roots.delete(view.key); };
  }, [roots, view.key, root]);
  const client = useQueryClient();
  const t = useTranslations("Board");
  const isBoard = view.kind === "global-board" || view.kind === "project-board";
  const subscribe = useCallback((notify: () => void) => {
    return isBoard ? subscribeRetainedBoardReadState(client, view, notify) : () => {};
  }, [client, view, isBoard]);
  const snapshot = useCallback(() => isBoard ? retainedBoardReadState(client, view) : "fresh" as const, [client, view, isBoard]);
  const readState = useSyncExternalStore(subscribe, snapshot, () => "fresh" as const);
  useLayoutEffect(() => {
    if (!active || !isBoard) return;
    // Start activation reads before paint, joining any already pending request.
    void refreshRetainedBoard(client, view);
  }, [active, isBoard, client, view]);
  return <div {...scroll} className="relative h-full min-h-0" data-retained-app-view={view.key} data-retained-tab-id={view.tabId ?? undefined} data-app-view-active={active ? "true" : "false"}
    data-board-read-state={isBoard ? readState : undefined} aria-busy={active && readState !== "fresh"}
    inert={!active} aria-hidden={!active || undefined} style={{ display: active ? undefined : "none" }}>
    <Activity mode={active ? "visible" : "hidden"}>
    <RetainedBoardTitle view={view} />
    <QueryReadBoundary phase={readState} keepContentWhileRefreshing={isBoard} className="h-full min-h-0" contentClassName="h-full min-h-0" fallback={
      readState === "error" ? (
        <BoardReadFailure error={retainedBoardReadFailure(client, view)} onRetry={() => void refreshRetainedBoard(client, view)} />
      ) : readState === "paused" ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground" role="alert">
          <p>{t("readPaused")}</p>
          {/* Join pending reads and retry only failed or stale prerequisites. */}
          <button type="button" className="underline" onClick={() => void refreshRetainedBoard(client, view)}>{t("readRetry")}</button>
        </div>
      ) : <BoardLoadingSkeleton />
    }>
    <AppTabNavigationScope activeId={view.tabId}>
      <AppTabRouteProvider route={view.route} active={active} activationSequence={activation.current.sequence}>
        {isBoard ? <BoardSurface />
          : view.kind === "pages" ? <Pages /> : view.kind === "pull-requests" ? <PullRequests />
          : view.kind === "feedback" ? <Feedback /> : view.kind === "triage" ? <Triage /> : <CollectionSurface />}
      </AppTabRouteProvider>
    </AppTabNavigationScope>
    </QueryReadBoundary>
    </Activity>
  </div>;
});

const HOME_ROUTE: RetainedAppView["route"] = { pathname: "/home", search: "", projectSegment: null };

// Shell and tab-list renders reach Home only through its own subscriptions:
// stable props and route identity keep the composer out of those renders.
const RetainedHome = memo(function RetainedHome({ tabId, active }: { tabId: string | null; active: boolean }) {
  const view = useMemo<RetainedAppView>(() => ({ key: "home", kind: "home", tabId, route: HOME_ROUTE }), [tabId]);
  return <Activity mode={active ? "visible" : "hidden"}>
    <RetainedBoardTitle view={view} />
    <AppTabNavigationScope activeId={tabId}>
      <AppTabRouteProvider route={HOME_ROUTE} active={active}><Home /></AppTabRouteProvider>
    </AppTabNavigationScope>
  </Activity>;
});

interface ViewHostRoute { pathname: string; search: string }

/** Next commits `history.pushState` in a later, interruptible transition. Until
 * it reaches an activated retained destination, that destination stands in for
 * its location, so the tab highlight and the content commit in one render.
 * In-tab navigation and cold destinations keep following Next. */
function useViewHostRoute(tabs: ReturnType<typeof useOptionalAppTabs>): ViewHostRoute {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const activeId = tabs?.activeId ?? null;
  const href = tabs?.session.getActiveHref() ?? null;
  const [activation, setActivation] = useState({ id: activeId, urgent: false });
  const ahead = !!tabs && !!href && normalizeAppTabLocation(href) !== normalizeAppTabLocation(`${pathname}?${search}`) &&
    tabs.session.isRetainedDestination(activeId, href);
  // Only the activation render opts in; the destination then holds until Next
  // commits it, so no intermediate location is lent to the incoming tab.
  const urgent = ahead && (activation.id !== activeId || activation.urgent);
  if (activation.id !== activeId || activation.urgent !== urgent) setActivation({ id: activeId, urgent });
  if (!urgent) return { pathname, search };
  const url = new URL(href!, "https://minddy.invalid");
  return { pathname: url.pathname, search: url.searchParams.toString() };
}

/** The labelled tab panel follows activation, so the shell around it does not. */
export function AppTabPanel({ children }: { children: ReactNode }) {
  const navigation = useOptionalAppTabNavigation();
  return <div id="app-tab-content" role={navigation ? "tabpanel" : undefined} aria-labelledby={navigation?.activeId ? `app-tab-${navigation.activeId}` : undefined} className="h-full min-h-0">
    <AppTabViewHost>{children}</AppTabViewHost>
  </div>;
}

/** One bounded host retains recent destinations while React suspends hidden effects. */
export function AppTabViewHost({ children }: { children: ReactNode }) {
  const tabs = useOptionalAppTabs();
  const route = useViewHostRoute(tabs);
  const { pathname } = route;
  const retained = !!tabs && !!retainedAppViewKind(pathname);
  // A destination the router has not committed yet (MIN-843) replaces the
  // page being left at once: its retained view when this tab keeps one, the
  // Home surface this host owns, or the destination's skeleton.
  const pending = usePendingNavigation();
  const ahead = pending && pending.pathname !== pathname ? pending : null;
  const aheadRetained = !!ahead && !!tabs && tabs.session.isRetainedDestination(tabs.activeId, ahead.href);
  const home = (ahead?.pathname ?? pathname) === "/home";
  // One small Home working surface, shared across responsive layouts. Another
  // Home tab starts its own draft; resizing does not reconstruct the composer.
  const [homeState, setHomeState] = useState({ seen: home, id: home ? tabs?.activeId ?? null : null, generation: 0 });
  let current = homeState;
  const homeId = tabs?.session.getActiveHref()?.split(/[?#]/)[0] === "/home" ? tabs.activeId : current.id;
  if (home && (!current.seen || (homeId && homeId !== current.id))) {
    current = { seen: true, id: homeId,
      generation: current.generation + (current.id && homeId && homeId !== current.id ? 1 : 0) };
    setHomeState(current);
  } else if (!home && current.seen && current.id && tabs && !tabs.tabs.some((tab) => tab.id === current.id)) {
    current = { ...current, seen: false, id: null, generation: current.generation + 1 };
    setHomeState(current);
  }
  return <>
    {current.seen && <div key={current.generation} className="h-full min-h-0" data-retained-home-view data-app-view-active={home ? "true" : "false"}
      inert={!home} aria-hidden={!home || undefined} style={{ display: home ? undefined : "none" }}>
      <RetainedHome tabId={current.id} active={home} />
    </div>}
    {tabs ? <DesktopTabViews homeWeight={current.seen ? 1 : 0} route={route}
      ahead={ahead ? { pathname: ahead.pathname, retained: aheadRetained } : null} /> : null}
    {ahead ? !home && !aheadRetained && <RouteLoadingSkeleton pathname={ahead.pathname} />
      : !retained && !home && children}
  </>;
}

function DesktopTabViews({ homeWeight, route: { pathname, search }, ahead }: {
  homeWeight: number; route: ViewHostRoute;
  /** A pending destination: its retained view activates ahead of the router, any other suspends them all. */
  ahead: { pathname: string; retained: boolean } | null;
}) {
  const { tabs, activeId, session } = useAppTabs();
  const client = useQueryClient();
  const [state, setState] = useState<{ location: string; tabId: string | null; tabIds: string; hrefs: string; views: RetainedAppView[]; visits: string[] }>({ location: "", tabId: null, tabIds: "", hrefs: "", views: [], visits: [] });
  // Mounted view roots, so the retention policy never searches the document.
  const [roots] = useState(() => new Map<string, HTMLElement>());
  const location = `${pathname}?${search}`;
  const tabIds = tabs.map((tab) => tab.id).join(",");
  const hrefs = JSON.stringify(tabs.map((tab) => [tab.id, tab.href]));
  const expectedLocation = normalizeAppTabLocation(session.getActiveHref());
  // Activation precedes a cold router commit. Never assign the outgoing board's
  // state to the incoming tab during that gap.
  const pendingActivation = state.tabId !== activeId && !!expectedLocation && expectedLocation !== normalizeAppTabLocation(location);
  const tabId = pendingActivation ? state.tabId : activeId;
  useColdBoardPrefetch(pathname === "/all" && !pendingActivation);
  let views = state.views;
  let visits = state.visits;
  if (state.location !== location || state.tabId !== tabId || state.tabIds !== tabIds || state.hrefs !== hrefs) {
    // Closing the outgoing tab must not tear down and recreate its board during
    // the short interval before the replacement route commits.
    if (!pendingActivation) {
      if (tabId && state.tabId !== tabId) visits = [...visits, tabId].slice(-32);
      const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      views = retainAppView(views, { pathname, search, projectSegment: projectSegmentFromPath(pathname) }, tabId, new Set(tabs.map((tab) => tab.id)), {
        budget: Math.max(1, retainedAppViewBudget(memory) - homeWeight), limit: RETAINED_APP_VIEW_LIMIT - homeWeight, visits,
        href: tabs.find((tab) => tab.id === tabId)?.href,
        cost: (view) => {
          if (view.kind === "pull-requests") {
            // Query data is already owned by the account client. Charge the
            // expensive diff only while its DOM exists, rather than evicting
            // frequent destinations for files an Activity tab has not mounted.
            const root = roots.get(view.key);
            if (root && !root.querySelector('[data-testid="pr-diff-view"]')) return 1;
            const pr = expandRef(new URLSearchParams(view.route.search).get("pr"));
            return Math.max(1, Math.ceil((client.getQueryData<{ files: unknown[] }>(["pull-request", pr])?.files.length ?? 400) / 200));
          }
          if (view.kind === "pages") {
            const root = roots.get(view.key);
            const previous = [...root?.querySelectorAll<HTMLElement>('[data-retained-page-document]') ?? []]
              .map((node) => node.dataset.retainedPageDocument!);
            const selected = view.route.pathname.match(/^\/projects\/[^/]+\/pages\/([^/]+)$/)?.[1];
            const active = selected && selected !== "trash" ? expandRef(selected) : null;
            if (!previous.length && !active) return 2;
            const eligible = new Set(previous.filter((id) => {
              const state = client.getQueryState(["page", id]);
              return state?.status === "success" && !isDraftPage(id) &&
                retainedPageDocumentCost(state.data) === 1;
            }));
            return Math.max(1, retainPageDocuments(previous, active, eligible).reduce((sum, id) =>
              sum + retainedPageDocumentCost(client.getQueryData(["page", id])), 0));
          }
          if (view.kind !== "global-board" && view.kind !== "project-board") return 1;
          const root = roots.get(view.key);
          if (root?.querySelector("[data-board-windowed]")) {
            // Charge only mounted card work; interaction pins still count.
            return Math.max(1, Math.ceil(root.querySelectorAll("[data-issue-id]").length / 200));
          }
          const data = view.kind === "global-board"
            ? client.getQueryData<{ issues: unknown[] }>(["me", "board"])?.issues
            : client.getQueryData<unknown[]>(["issues", expandProjectSegment(view.route.projectSegment)]);
          return Math.max(1, Math.ceil((data?.length ?? (view.kind === "global-board" ? 600 : 200)) / 200));
        },
      });
    }
    setState({ location, tabId, tabIds, hrefs, views, visits });
  }
  useLayoutEffect(() => {
    const qualifies = (id: string | null, href: string) => isRetainedDestination(views, id, href);
    session.isRetainedDestination = qualifies;
    return () => {
      if (session.isRetainedDestination === qualifies) session.isRetainedDestination = () => false;
    };
  }, [session, views]);
  // One owner per client follows the views; a switch keeps shared observers.
  const retainedData = useRef<ReturnType<typeof createRetainedBoardData> | null>(null);
  useEffect(() => {
    const data = createRetainedBoardData(client);
    retainedData.current = data;
    return () => {
      data.dispose();
      if (retainedData.current === data) retainedData.current = null;
    };
  }, [client]);
  useEffect(() => { retainedData.current?.update(views); }, [client, views]);
  return <>
    {views.map((view) => {
      const shown = ahead ? (ahead.retained ? ahead.pathname : null) : pathname;
      const active = !!shown && !!retainedAppViewKind(shown) && view.tabId === tabId && view.route.pathname === shown;
      return <RetainedBoard key={view.key} view={view} active={active} roots={roots} />;
    })}
  </>;
}
