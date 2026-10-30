"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { registerRecordIds } from "./ref-registry";

interface ProjectRoute {
  /** The `/projects/[segment]` value as written (`min-3f2a9c81`). */
  segment: string;
  /** Its id, resolved by the project layout on the server. */
  projectId: string;
}

const Context = createContext<ProjectRoute | null>(null);

/**
 * Carries the id the project layout resolved from the readable segment, so
 * the server render and the first client render know the project before its
 * list loads. On the client it also seeds the short-code registry, which the
 * URL readers outside React use.
 */
export function ProjectRouteProvider({ segment, projectId, children }: ProjectRoute & { children: ReactNode }) {
  useState(() => {
    // Module state is per browser tab; on the server it would be shared by
    // every request, so the server render relies on the context alone.
    if (typeof window !== "undefined") registerRecordIds({ id: projectId });
    return null;
  });
  return <Context.Provider value={{ segment, projectId }}>{children}</Context.Provider>;
}

/** The id the layout resolved for `segment`, when it is the current route's. */
export function useResolvedProjectRoute(segment: string | null): string | null {
  const route = useContext(Context);
  return route && segment && route.segment === segment ? route.projectId : null;
}
