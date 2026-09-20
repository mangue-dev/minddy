"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

/**
 * How many back presses the sidebar may stack on top of one route. Two: a
 * project page goes back to the project panel, then to the home panel — and
 * the home panel is the top, there is nothing above it to show.
 */
const MAX_BACK_LEVELS = 2;

/**
 * The SECONDARY sidebar — the navigation column specific to a page: the list
 * of pull requests, agent sessions, triage, returns.
 *
 * It is written IN the page, with the selection state which controls the detail just
 * next to it; on desktop it is DISPLAYED INSIDE the primary sidebar, which
 * becomes modular: its nav options give way and the page's column is
 * teleported there, below a back row (MIN-546). The primary never
 * resizes — there is no longer a gutter of its own next to it.
 *
 * This context is the thread between the two halves: two teleport points
 * (`headerSlot` for the page's filter/actions strip, `slot` for its item
 * list, both installed by the primary sidebar) and a count of the mounted
 * bars (`present`). The portals let the bar change place in the DOM without
 * leaving its component: the selection, filters and queries stay where they are read.
 *
 * It also carries the BACK ROW's browse state: pressing back lifts the
 * sidebar one level WITHOUT navigating — the page keeps its place until a
 * selection is made. `backLevel` counts the presses stacked on the route's
 * own level, and `hosting` says whether the sidebar's current panel still
 * hosts the teleported bar (it does not, the moment the browse leaves the
 * secondary level): a page reads it to dock its bar away instead of letting
 * it fall back inline and reflow the content.
 *
 * Under `desktop` (768 px) none of this applies: the bar remains where
 * it is written, in the page, and the mobile behavior does not move.
 */
interface SecondarySidebar {
  /** The frame element where pages teleport their bar's header (desktop only). */
  headerSlot: HTMLElement | null;
  setHeaderSlot: (el: HTMLElement | null) => void;
  /** The frame element where pages teleport their bar's body (desktop only). */
  slot: HTMLElement | null;
  setSlot: (el: HTMLElement | null) => void;
  /** Does a page mount a secondary bar? The primary then swaps to it (level 2/3). */
  present: boolean;
  /** To be called when mounting a bar; the rendered function removes it from the account. */
  register: () => () => void;
  /**
   * Back presses stacked on the route's own level (0 = that level). A press
   * older than the current route is void: real navigation rebases the levels,
   * so the count reads 0 again without any effect to undo.
   */
  backLevel: number;
  /** The back row: one level up in the SIDEBAR only — the page does not move. */
  goBack: () => void;
  /** Ends the browse: back to the route's own level. */
  resetBack: () => void;
  /**
   * Does the sidebar's CURRENT panel include the teleport points? False the
   * moment the browse leaves the secondary level — the page then docks its
   * bar away rather than reflowing the content with an inline column.
   */
  hosting: boolean;
}

const SecondarySidebarContext = createContext<SecondarySidebar | null>(null);

export function useSecondarySidebar(): SecondarySidebar {
  const ctx = useContext(SecondarySidebarContext);
  if (!ctx) {
    throw new Error(
      "useSecondarySidebar must be used within a SecondarySidebarProvider",
    );
  }
  return ctx;
}

export function SecondarySidebarProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // An ACCOUNT, not a boolean: between two pages with a secondary bar, the old one
  // disassembles after mounting the new one. A boolean would fall back to false
  // by the way, the time of an image - enough to see the primary unfold
  // then fall back immediately.
  const [count, setCount] = useState(0);
  // The back row's browse, ANCHORED to the route it was pressed on: any
  // navigation (route change) makes the anchor stale and the count reads 0
  // again — no effect to run, no stale panel for one rendering.
  const [back, setBack] = useState<{ from: string; count: number }>({
    from: "",
    count: 0,
  });
  const backLevel = back.from === pathname ? back.count : 0;

  const register = useCallback(() => {
    setCount((c) => c + 1);
    return () => setCount((c) => c - 1);
  }, []);

  const goBack = useCallback(() => {
    setBack((prev) => ({
      from: pathname,
      count:
        prev.from === pathname ? Math.min(prev.count + 1, MAX_BACK_LEVELS) : 1,
    }));
  }, [pathname]);

  const resetBack = useCallback(() => {
    setBack((prev) => (prev.count === 0 ? prev : { ...prev, count: 0 }));
  }, []);

  const hosting = routeHasSecondaryNav(pathname) && backLevel === 0;

  const value = useMemo<SecondarySidebar>(
    () => ({
      headerSlot,
      setHeaderSlot,
      slot,
      setSlot,
      present: count > 0,
      register,
      backLevel,
      goBack,
      resetBack,
      hosting,
    }),
    [headerSlot, slot, count, register, backLevel, goBack, resetBack, hosting],
  );

  return (
    <SecondarySidebarContext.Provider value={value}>
      {children}
    </SecondarySidebarContext.Provider>
  );
}

/** Which panel the primary sidebar shows — the levels of MIN-546, resolved. */
export type SidebarPanel = "secondary" | "project" | "home";

/**
 * The panel for a route and its browse state, as a pure function so the
 * levels stay testable: `hasBackRow` — the route carries a level 2/3 back
 * row; `hasProject` — the route lives in a project (the project panel is its
 * level 2); `backLevel` — the back presses stacked on the route.
 */
export function sidebarPanelForRoute(
  hasBackRow: boolean,
  hasProject: boolean,
  backLevel: number,
): SidebarPanel {
  if (hasBackRow && backLevel === 0) return "secondary";
  // A project page sits at the project panel; one back press from a project's
  // level-3 page lands there, one press from the project panel goes home.
  if (hasProject && backLevel <= (hasBackRow ? 1 : 0)) return "project";
  return "home";
}

/**
 * Routes whose page mounts a secondary bar, i.e. where the primary sidebar
 * descends to level 2 (global pages) or 3 (project pages).
 *
 * This static route answer runs the level switch (MIN-546) from the server's
 * HTML, before any bar is mounted: no mounted-count dance, no width to
 * reserve — the primary sidebar keeps its width. It does not need to be exact
 * for the application to be fair: a route forgotten here costs one level miss
 * on the first display, not a bug.
 */
export function routeHasSecondaryNav(pathname: string): boolean {
  if (pathname.startsWith("/trash")) return true;
  if (pathname.startsWith("/pull-requests")) return true;
  if (pathname.startsWith("/routines")) return true;
  if (pathname.startsWith("/settings")) return true;
  if (pathname.startsWith("/admin")) return true;
  return /^\/projects\/[^/]+\/(triage|feedback|objectives|settings|pages)/.test(
    pathname,
  );
}
