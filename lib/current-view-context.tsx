"use client";

/**
 * What the current screen is, when the URL isn't enough to tell.
 *
 * “Save current view” (command palette) starts from the address:
 * it already has the route, the wiki page, the settings tab, the objective
 * open. But many surfaces keep their selection in MEMORY and
 * voluntarily clean up the URL behind them — /agents deletes `?run=` as soon as
 * that we choose a conversation (otherwise the following navigation to this
 * same conversation would be inert: pushing the current address does nothing),
 * /pull-requests keeps the clicked PR outside the address, a board keeps its view
 * active in localStorage.
 *
 * These surfaces therefore PUBLISH the address which reconstitutes them, via
 * `usePublishCurrentView`.
 *
 * **Nothing is played during a render**, and that's the point. The publication lives
 * in a ref, not in a state: otherwise each selection change — a
 * PR clicked, a changed board view — would go back through the provider and
 * would re-render the entire shell and the page under it, for a value that
 * no one displays. The palette only questions it at the moment when it has
 * need: `resolveHref()` when clicking on “Save”, `resolveLabel()` when
 * l'ouverture du champ de nom.
 *
 * Ownership: the same lock as `useAssistantContext` — a page that is
 * disassembles only unpublishes if it is still the owner, otherwise navigation
 * A→B (B goes up before A's cleanup runs) would clear the
 * fresh publication from B.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { buildViewHref } from "@/lib/saved-view-href";

export interface CurrentViewSnapshot {
  /**
   * The internal address that exactly re-opens this screen, query included. There
   * page makes it herself — she knows what she displays.
   */
  href: string;
  /**
   * Name proposed by default in the palette field (“Conversations ·
   * MIN-42"). Optional: without it, the field opens empty.
   */
  label?: string;
}

interface CurrentViewContextValue {
  publish: (snapshot: CurrentViewSnapshot | null, ownerId: string) => void;
  read: () => CurrentViewSnapshot | null;
}

const CurrentViewContext = createContext<CurrentViewContextValue | null>(null);

export function CurrentViewProvider({ children }: { children: ReactNode }) {
  const snapshotRef = useRef<CurrentViewSnapshot | null>(null);
  const ownerRef = useRef<string | null>(null);

  // Stable identity, for good: no consumer ever returns to
  // because of a publication.
  const value = useMemo<CurrentViewContextValue>(
    () => ({
      publish: (next, ownerId) => {
        if (next) {
          ownerRef.current = ownerId;
          snapshotRef.current = next;
          return;
        }
        // Only the current owner has the right to delete.
        if (ownerRef.current !== ownerId) return;
        ownerRef.current = null;
        snapshotRef.current = null;
      },
      read: () => snapshotRef.current,
    }),
    []
  );

  return (
    <CurrentViewContext.Provider value={value}>
      {children}
    </CurrentViewContext.Provider>
  );
}

/**
 * Publishes the address which reconstructs the screen, while the component is
 * mounted. To be called from surfaces whose selection does not live in
 * the URL; everywhere else, call nothing — `window.location` already says everything.
 */
export function usePublishCurrentView(
  snapshot: CurrentViewSnapshot | null
): void {
  const ctx = useContext(CurrentViewContext);
  const publish = ctx?.publish;
  const ownerId = useId();
  // Serialized so that the effect only replays on a real change: the caller
  // rebuilds its object each time it is rendered.
  const key = snapshot ? JSON.stringify(snapshot) : null;

  useEffect(() => {
    if (!publish) return;
    publish(key ? (JSON.parse(key) as CurrentViewSnapshot) : null, ownerId);
    return () => publish(null, ownerId);
  }, [key, ownerId, publish]);
}

export interface CurrentView {
  /** The address to register, resolved at the time of the call. */
  resolveHref: () => string;
  /** The name that the page suggests, resolved at the time of the call. */
  resolveLabel: () => string | null;
}

/**
 * Read by the palette, never during a render: the two resolvers are called
 * in an event manager (clicking on “Save”, opening the
 * action menu). Reading `window.location` is therefore safe — no server rendering
 * to detune, and no `useSearchParams` which would impose a boundary
 * `<Suspense>` around the entire shell.
 */
export function useCurrentView(): CurrentView {
  const ctx = useContext(CurrentViewContext);
  const read = ctx?.read;

  const resolveHref = useCallback(() => {
    const published = read?.() ?? null;
    if (published) return published.href;
    if (typeof window === "undefined") return "/";
    return buildViewHref(window.location.pathname, window.location.search);
  }, [read]);

  const resolveLabel = useCallback(
    () => read?.()?.label ?? null,
    [read]
  );

  return useMemo(
    () => ({ resolveHref, resolveLabel }),
    [resolveHref, resolveLabel]
  );
}
