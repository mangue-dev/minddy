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
 * next to it; it is DISPLAYED in the application frame, to the left of the header,
 * full height, stuck to the primary sidebar. It's a second level of
 * navigation, not a piece of content — and the breadcrumb header starts
 * so AFTER it, as it starts after the primary.
 *
 * This context is the thread between the two halves: a teleport point
 * (`slot`, installed by the chassis) and a count of the mounted bars (`present`, which
 * switches the primary to rail). The portal is what allows the bar to change place in the DOM without leaving its component: the selection, the filters and the queries stay where they are read.
 *
 * Under `desktop` (768 px) none of this applies: the bar remains where
 * it is written, in the page, and the mobile behavior does not move.
 */
interface SecondarySidebar {
  /** The frame element where pages teleport their bar (desktop only). */
  slot: HTMLElement | null;
  setSlot: (el: HTMLElement | null) => void;
  /** Does a page go up a secondary bar? The primary then goes on rail. */
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
    () => ({ slot, setSlot, present: count > 0, register }),
    [slot, count, register],
  );

  return (
    <SecondarySidebarContext.Provider value={value}>
      {children}
    </SecondarySidebarContext.Provider>
  );
}

/**
 * Routes whose page mounts a secondary bar.
 *
 * The above count is the truth, and it is sufficient — EXCEPT before hydration:
 * at server rendering no bar is yet mounted, the primary would therefore leave
 * unfolded and the content full width, to reorganize suddenly to
 * hydration. This table gives the answer from the server's HTML, and the
 * account takes control again just after.
 *
 * It therefore does not need to be exact for the application to be fair: a
 * route forgotten here costs a rearrangement on the first display, not a bug. A
 * page whose bar disappears (empty list) corrects itself.
 */
export function routeHasSecondaryNav(pathname: string): boolean {
  if (pathname.startsWith("/inbox")) return true;
  if (pathname.startsWith("/pull-requests")) return true;
  if (pathname.startsWith("/agents")) return true;
  if (pathname.startsWith("/routines")) return true;
  if (pathname.startsWith("/settings")) return true;
  if (pathname.startsWith("/admin")) return true;
  return /^\/projects\/[^/]+\/(triage|feedback|objectives|settings|pages)/.test(
    pathname,
  );
}
