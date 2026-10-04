"use client";

import { Activity, memo, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { appTabSurfaceLoaders } from "@/lib/app-tab-surfaces";
import { usePathname, useSearchParams } from "next/navigation";
import { AppTabNavigationScope, useAppTabs } from "@/lib/app-tabs-context";
import { AppTabRouteProvider } from "@/lib/app-tab-route-context";
import { normalizeAppTabLocation } from "@/lib/app-tab-location";
import { isRetainedDestination, retainAppView, retainedAppViewKind, type RetainedAppView } from "@/lib/retained-app-views";
import { RetainedBoardTitle } from "./retained-board-title";
import { BoardLoadingSkeleton } from "./board-loading-skeleton";
import { useRetainedBoardScroll } from "@/lib/use-retained-board-scroll";
import { useColdBoardPrefetch } from "@/lib/use-cold-board-prefetch";
import { observeRetainedBoardData } from "@/lib/retained-board-data";
import { retainedBoardKeys, retainedBoardReadState } from "@/lib/retained-board-read-state";
import { useTranslations } from "next-intl";

const GlobalBoard = dynamic(() => appTabSurfaceLoaders["global-board"]().then((module) => module.GlobalBoard), { loading: () => <BoardLoadingSkeleton /> });
const ProjectBoard = dynamic(appTabSurfaceLoaders["project-board"], { loading: () => <BoardLoadingSkeleton /> });

const Pages = dynamic(() => appTabSurfaceLoaders.pages().then((module) => module.PagesShell));
const PullRequests = dynamic(appTabSurfaceLoaders["pull-requests"]);
const Feedback = dynamic(() => appTabSurfaceLoaders.feedback().then((module) => module.FeedbackTeamPage));
const Triage = dynamic(appTabSurfaceLoaders.triage);

const RetainedBoard = memo(function RetainedBoard({ view, active }: { view: RetainedAppView; active: boolean }) {
  const activation = useRef({ active, at: Date.now() });
  if (active && !activation.current.active) activation.current.at = Date.now();
  activation.current.active = active;
  const scroll = useRetainedBoardScroll(active);
  const client = useQueryClient();
  const t = useTranslations("Board");
  const subscribe = useCallback((notify: () => void) => client.getQueryCache().subscribe(notify), [client]);
  const isBoard = view.kind === "global-board" || view.kind === "project-board";
  const snapshot = useCallback(() => isBoard ? retainedBoardReadState(client, view) : "fresh", [client, view, isBoard]);
  const readState = useSyncExternalStore(subscribe, snapshot, () => "fresh");
  return <div {...scroll} className="relative h-full min-h-0" data-retained-app-view={view.key} data-retained-tab-id={view.tabId ?? undefined} data-app-view-active={active ? "true" : "false"}
    data-board-read-state={isBoard ? readState : undefined} aria-busy={active && readState !== "fresh"}
    inert={!active} aria-hidden={!active || undefined} style={{ display: active ? undefined : "none" }}>
    <Activity mode={active ? "visible" : "hidden"}>
    <RetainedBoardTitle view={view} />
    <AppTabNavigationScope activeId={view.tabId}>
      <AppTabRouteProvider route={view.route} active={active} activatedAt={activation.current.at}>
        {view.kind === "global-board" ? <GlobalBoard /> : view.kind === "project-board" ? <ProjectBoard />
          : view.kind === "pages" ? <Pages /> : view.kind === "pull-requests" ? <PullRequests />
          : view.kind === "feedback" ? <Feedback /> : <Triage />}
      </AppTabRouteProvider>
    </AppTabNavigationScope>
    </Activity>
    {active && readState !== "fresh" && <div role="status" className="absolute bottom-3 left-3 z-40 flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
      {t(readState === "error" ? (client.getQueryData(retainedBoardKeys(view)[0]) === undefined ? "readError" : "readPreviousError") : readState === "paused" ? "readPaused" : readState === "loading" ? "readLoading" : "readRefreshing")}
      {(readState === "error" || readState === "paused") && <button type="button" className="underline" onClick={() => {
        for (const queryKey of retainedBoardKeys(view)) void client.refetchQueries({ queryKey, exact: true });
      }}>{t("readRetry")}</button>}
    </div>}
  </div>;
});

/** One bounded host retains recent destinations while React suspends hidden effects. */
export function AppTabViewHost({ children }: { children: ReactNode }) {
  const { tabs, activeId, session } = useAppTabs();
  const client = useQueryClient();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [state, setState] = useState<{ location: string; tabId: string | null; tabIds: string; views: RetainedAppView[]; visits: string[] }>({ location: "", tabId: null, tabIds: "", views: [], visits: [] });
  const location = `${pathname}?${search}`;
  const tabIds = tabs.map((tab) => tab.id).join(",");
  const expectedLocation = normalizeAppTabLocation(session.getActiveHref());
  // Activation precedes a cold router commit. Never assign the outgoing board's
  // state to the incoming tab during that gap.
  const pendingActivation = state.tabId !== activeId && !!expectedLocation && expectedLocation !== normalizeAppTabLocation(location);
  const tabId = pendingActivation ? state.tabId : activeId;
  useColdBoardPrefetch(pathname === "/all" && !pendingActivation);
  let views = state.views;
  let visits = state.visits;
  if (state.location !== location || state.tabId !== tabId || state.tabIds !== tabIds) {
    // Closing the outgoing tab must not tear down and recreate its board during
    // the short interval before the replacement route commits.
    if (!pendingActivation) {
      if (tabId && state.tabId !== tabId) visits = [...visits, tabId].slice(-32);
      const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      const pressured = !!memory && memory.usedJSHeapSize > memory.jsHeapSizeLimit * 0.7;
      views = retainAppView(views, { pathname, search, projectId: pathname.match(/^\/projects\/([^/]+)/)?.[1] ?? null }, tabId, new Set(tabs.map((tab) => tab.id)), {
        budget: pressured ? 3 : 6, limit: 6, visits,
        href: tabs.find((tab) => tab.id === tabId)?.href,
        cost: (view) => {
          if (view.kind === "pull-requests") {
            // Query data is already owned by the account client. Charge the
            // expensive diff only while its DOM exists, rather than evicting
            // frequent destinations for files an Activity tab has not mounted.
            const root = document.querySelector(`[data-retained-app-view="${view.key}"]`);
            if (root && !root.querySelector('[data-testid="pr-diff-view"]')) return 1;
            const pr = new URLSearchParams(view.route.search).get("pr");
            return Math.max(1, Math.ceil((client.getQueryData<{ files: unknown[] }>(["pull-request", pr])?.files.length ?? 400) / 200));
          }
          if (view.kind !== "global-board" && view.kind !== "project-board") return view.kind === "pages" ? 2 : 1;
          const data = view.kind === "global-board"
            ? client.getQueryData<{ issues: unknown[] }>(["me", "board"])?.issues
            : client.getQueryData<unknown[]>(["issues", view.route.projectId]);
          return Math.max(1, Math.ceil((data?.length ?? (view.kind === "global-board" ? 600 : 200)) / 200));
        },
      });
    }
    setState({ location, tabId, tabIds, views, visits });
  }
  const kind = retainedAppViewKind(pathname);
  useLayoutEffect(() => {
    const qualifies = (id: string | null, href: string) => isRetainedDestination(views, id, href);
    session.isRetainedDestination = qualifies;
    return () => {
      if (session.isRetainedDestination === qualifies) session.isRetainedDestination = () => false;
    };
  }, [session, views]);
  useEffect(() => observeRetainedBoardData(client, views), [client, views]);
  return <>
    {views.map((view) => {
      const active = !!kind && view.tabId === tabId && view.route.pathname === pathname;
      return <RetainedBoard key={view.key} view={view} active={active} />;
    })}
    {!kind && children}
  </>;
}
