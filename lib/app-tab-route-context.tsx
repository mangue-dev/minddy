"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export interface AppTabRouteSnapshot {
  pathname: string;
  search: string;
  projectId: string | null;
}
const Context = createContext<AppTabRouteSnapshot | null>(null);

export function AppTabRouteProvider({ route, children }: { route: AppTabRouteSnapshot; children: ReactNode }) {
  return <Context.Provider value={route}>{children}</Context.Provider>;
}

function LiveRoute({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const route = useMemo(() => ({ pathname, search, projectId: pathname.match(/^\/projects\/([^/]+)/)?.[1] ?? null }), [pathname, search]);
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
  return { pathname: route.pathname, searchParams, projectId: route.projectId };
}
