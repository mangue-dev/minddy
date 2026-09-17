"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // An ACCOUNT, not a boolean: between two pages with a secondary bar, the old one
  // disassembles after mounting the new one. A boolean would fall back to false
  // by the way, the time of an image - enough to see the primary unfold
  // then fall back immediately.
  const [count, setCount] = useState(0);

  const register = useCallback(() => {
    setCount((c) => c + 1);
    return () => setCount((c) => c - 1);
  }, []);

  const value = useMemo<SecondarySidebar>(
    () => ({ headerSlot, setHeaderSlot, slot, setSlot, present: count > 0, register }),
    [headerSlot, slot, count, register],
  );

  return (
    <SecondarySidebarContext.Provider value={value}>
      {children}
    </SecondarySidebarContext.Provider>
  );
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
