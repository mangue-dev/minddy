"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useRefRegistryVersion } from "./use-ref-registry-version";
import { useResolvedProjectRoute } from "./project-route-context";
import { projectIdFromPath, projectSegmentFromPath } from "./project-id-from-path";

export interface AppTabRouteSnapshot {
  pathname: string;
  search: string;
  /** The raw `/projects/[ref]` segment; `useAppTabRoute` expands it to an id. */
  projectSegment: string | null;
}
const ActiveContext = createContext(true);
const ActivationContext = createContext(0);
export const useAppTabActivation = () => useContext(ActivationContext);
export const useAppTabActive = () => useContext(ActiveContext);

const Context = createContext<AppTabRouteSnapshot | null>(null);

export function AppTabRouteProvider({ route, children, active = true, activationSequence = 0 }: { route: AppTabRouteSnapshot; children: ReactNode; active?: boolean; activationSequence?: number }) {
  return <ActivationContext.Provider value={activationSequence}><ActiveContext.Provider value={active}><Context.Provider value={route}>{children}</Context.Provider></ActiveContext.Provider></ActivationContext.Provider>;
}

function LiveRoute({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const route = useMemo(() => ({ pathname, search, projectSegment: projectSegmentFromPath(pathname) }), [pathname, search]);
  return <AppTabRouteProvider route={route}>{children}</AppTabRouteProvider>;
}

/** Standalone route entries read Next; retained entries never subscribe to it. */
export function AppTabRouteBoundary({ children }: { children: ReactNode }) {
  const retained = useContext(Context);
  return retained ? children : <LiveRoute>{children}</LiveRoute>;
}

/** Hidden views retain their own location while the window navigates elsewhere. */
export function useAppTabRoute() {
  const route = useContext(Context);
  if (!route) throw new Error("useAppTabRoute requires AppTabRouteBoundary");
  const query = route.search;
  const searchParams = useMemo(() => new URLSearchParams(query), [query]);
  const pathname = route.pathname;
  // The URL carries a short code; it expands once the project list is loaded.
  const registryVersion = useRefRegistryVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- The registry version is the input that changes the expansion.
  const expanded = useMemo(() => projectIdFromPath(pathname), [pathname, registryVersion]);
  // The project layout resolved the segment server-side: known from the very
  // first render, before the project list arrives.
  const resolved = useResolvedProjectRoute(route.projectSegment);
  const projectId = expanded ?? resolved;
  return { pathname, searchParams, projectId };
}
