"use client";

import { Activity, memo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import { AppTabNavigationScope, useAppTabs } from "@/lib/app-tabs-context";
import { AppTabRouteProvider } from "@/lib/app-tab-route-context";
import { normalizeAppTabLocation } from "@/lib/app-tab-location";
import { retainAppView, retainedAppViewKind, type RetainedAppView } from "@/lib/retained-app-views";
import { BoardLoadingSkeleton } from "./board-loading-skeleton";
import { useRetainedBoardScroll } from "@/lib/use-retained-board-scroll";
import { useColdBoardPrefetch } from "@/lib/use-cold-board-prefetch";

const GlobalBoard = dynamic(() => import("./global-board").then((module) => module.GlobalBoard), { loading: () => <BoardLoadingSkeleton /> });
const ProjectBoard = dynamic(() => import("@/app/(app)/projects/[id]/page"), { loading: () => <BoardLoadingSkeleton /> });

const RetainedBoard = memo(function RetainedBoard({ view, active }: { view: RetainedAppView; active: boolean }) {
  const scroll = useRetainedBoardScroll(active);
  return <div {...scroll} className="h-full min-h-0" data-retained-app-view={view.key} data-app-view-active={active ? "true" : "false"}
    inert={!active} aria-hidden={!active || undefined} style={{ display: active ? undefined : "none" }}>
    <Activity mode={active ? "visible" : "hidden"}>
    <AppTabNavigationScope activeId={view.tabId}>
      <AppTabRouteProvider route={view.route}>
        {view.kind === "global-board" ? <GlobalBoard /> : <ProjectBoard />}
      </AppTabRouteProvider>
    </AppTabNavigationScope>
    </Activity>
  </div>;
});

/** Retain rich boards with React-managed effect suspension and a strict LRU bound. */
export function AppTabViewHost({ children }: { children: ReactNode }) {
  const { tabs, activeId, session } = useAppTabs();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [state, setState] = useState<{ location: string; tabId: string | null; tabIds: string; views: RetainedAppView[] }>({ location: "", tabId: null, tabIds: "", views: [] });
  const location = `${pathname}?${search}`;
  const tabIds = tabs.map((tab) => tab.id).join(",");
  const expectedLocation = normalizeAppTabLocation(session.getActiveHref());
  // Activation precedes a cold router commit. Never assign the outgoing board's
  // state to the incoming tab during that gap.
  const pendingActivation = state.tabId !== activeId && !!expectedLocation && expectedLocation !== normalizeAppTabLocation(location);
  const tabId = pendingActivation ? state.tabId : activeId;
  useColdBoardPrefetch(pathname === "/all" && !pendingActivation);
  let views = state.views;
  if (state.location !== location || state.tabId !== tabId || state.tabIds !== tabIds) {
    // Closing the outgoing tab must not tear down and recreate its board during
    // the short interval before the replacement route commits.
    if (!pendingActivation) views = retainAppView(views, { pathname, search, projectId: pathname.match(/^\/projects\/([^/]+)/)?.[1] ?? null }, tabId, new Set(tabs.map((tab) => tab.id)));
    setState({ location, tabId, tabIds, views });
  }
  const kind = retainedAppViewKind(pathname);
  return <>
    {views.map((view) => {
      const active = !!kind && view.tabId === tabId && view.route.pathname === pathname;
      return <RetainedBoard key={view.key} view={view} active={active} />;
    })}
    {!kind && children}
  </>;
}
