"use client";

import { useMemo } from "react";
import { pageHref, pagesHref, pushPagesHistory } from "./pages-navigation";
import { useStableCallback } from "./use-stable-callback";
import type { PaletteGroup } from "@/components/header-search-pill";

const NO_GROUPS: PaletteGroup[] = [];

export interface PaletteModelState {
  /** The palette code is warm (idle warm-up or first open). */
  mounted: boolean;
  mobileLayout: boolean;
  open: boolean;
}

/**
 * The cross-project palette model (tickets, objectives and pages of every
 * project), built at most once per input change.
 *
 * Desktop keeps the model between openings, so it depends on that decision
 * rather than on the raw open state: opening or closing ⌘K reuses it. Narrow
 * windows mount everything they receive, so they build it only while open.
 */
export function usePaletteDataGroups<I, O, P>(
  state: PaletteModelState,
  build: (issues: I[], objectives: O[], pages: P[]) => PaletteGroup[],
  issues: I[],
  objectives: O[],
  pages: P[],
): PaletteGroup[] {
  const enabled = state.mounted && (!state.mobileLayout || state.open);
  return useMemo(
    () => (enabled ? build(issues, objectives, pages) : NO_GROUPS),
    [enabled, build, issues, objectives, pages],
  );
}

/**
 * Opens a wiki page from the palette. Inside the project's pages surface the
 * shell keeps its editor router and only writes history; elsewhere it is a
 * normal navigation.
 *
 * The identity is stable: the current pathname is read when a row is
 * selected, so a route change does not rebuild every page row of the model.
 */
export function useWikiPageNavigation(
  pathname: string,
  router: { push: (href: string) => void },
  openDestination: (href: string, open: () => void) => void,
): (projectId: string, pageId: string) => void {
  return useStableCallback((projectId: string, pageId: string) => {
    const href = pageHref(projectId, pageId);
    const base = pagesHref(projectId);
    if (pathname === base || pathname.startsWith(`${base}/`)) {
      openDestination(href, () => pushPagesHistory(href));
    } else {
      router.push(href);
    }
  });
}
