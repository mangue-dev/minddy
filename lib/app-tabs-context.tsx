"use client";
import { createContext, Suspense, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth-context";
import { createAppTab, deleteAppTab, patchAppTab, moveAppTab } from "./app-tabs-api";
import { AppTabsSession, type AppTabsSnapshot } from "./app-tabs-session";
import { appTabsQueryKey, useAppTabsQuery } from "./use-app-tabs-query";
import { AppTabRouteSync } from "@/components/app-tab-route-sync";
import { appTabsStorageKey } from "./app-tabs-storage";
import { prefetchAppTabDestination } from "./prefetch-tab-destination";
import { createPrTabPreparation } from "./pr-tab-preparation";
import { NavigationContext, useOptionalAppTabNavigation } from "./app-tab-navigation-context";
import { removeLocalSnapshot, restoreLocalSnapshot, saveLocalSnapshot } from "./local-snapshots";

interface AppTabsValue extends AppTabsSnapshot {
  session: AppTabsSession;
  loading: boolean;
  loadError: boolean;
  reload: () => void;
}
const Context = createContext<AppTabsValue | null>(null);
// Persistence and tab-list changes belong to the strip. Pages only need the
// active tab, and action handlers need the stable account session.
// `NavigationContext` itself lives in ./app-tab-navigation-context (imported
// here and re-exported below) so lower-level modules can read it without a
// dependency cycle through this provider.
const SessionContext = createContext<AppTabsSession | null>(null);

export function AppTabsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user ? <AccountTabs key={user.id} owner={user.id}>{children}</AccountTabs> : children;
}

function AccountTabs({ owner, children }: { owner: string; children: ReactNode }) {
  const client = useQueryClient();
  const router = useRouter();
  const query = useAppTabsQuery(owner);
  const storageKey = appTabsStorageKey(owner);
  const session = useMemo(() => {
    const key = appTabsQueryKey(owner);
    const abort = new AbortController();
    async function write<T>(operation: () => Promise<T>): Promise<T> {
      await client.cancelQueries({ queryKey: key });
      try { return await operation(); }
      finally { void client.invalidateQueries({ queryKey: key }); }
    }
    const controller = new AppTabsSession(owner, {
      create: (ensure, id) => write(() => createAppTab(ensure, id, abort.signal)),
      patch: (tab, patch) => write(() => patchAppTab(tab, patch, abort.signal)),
      close: (tab) => write(() => deleteAppTab(tab, abort.signal)),
      move: (tab, beforeId) => write(() => moveAppTab(tab, beforeId, abort.signal)),
    });
    controller.onDispose = () => abort.abort();
    return controller;
  }, [owner, client]);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const mounted = useRef(false);
  useEffect(() => {
    const preparation = createPrTabPreparation(client);
    let previous = "";
    const visit = () => {
      const state = session.getSnapshot();
      const active = state.tabs.find((tab) => tab.id === state.activeId);
      if (!active) return;
      const identity = `${active.id}:${active.href}`;
      if (identity === previous) return;
      previous = identity;
      preparation.visit(active.href, state.tabs.map((tab) => tab.href));
    };
    const stop = session.subscribe(visit);
    visit();
    return () => { stop(); preparation.dispose(); };
  }, [client, session]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Strict Mode replays effects with the same session. Dispose only after
      // an actual unmount so in-flight work cannot affect another account.
      queueMicrotask(() => { if (!mounted.current) session.dispose(); });
    };
  }, [session]);
  useEffect(() => {
    // One warmup attempt per href (tab label, palette row): prefetchQuery
    // itself respects staleTime, so a fresh cache costs nothing anyway.
    const attempted = new Set<string>();
    session.prefetch = (href) => {
      router.prefetch(href);
      prefetchAppTabDestination(client, href, attempted);
    };
    session.navigate = (href) => {
      const current = window.location.pathname;
      const next = href.split(/[?#]/)[0];
      const wikiRoot = current.match(/^\/projects\/[^/]+\/pages(?:\/|$)/)?.[0].replace(/\/$/, "");
      if (session.isRetainedDestination(session.getSnapshot().activeId, href) ||
          (wikiRoot && (next === wikiRoot || next.startsWith(`${wikiRoot}/`)))) window.history.pushState(null, "", href);
      else router.push(href, { scroll: false });
    };
    session.remember = (id, href) => {
      void saveLocalSnapshot(sessionStorage, storageKey, "window-tabs", { id, href }).catch(() => {});
    };
  }, [router, session, storageKey, client]);
  useEffect(() => {
    if (!query.data) return;
    session.receive(query.data);
    // Server tab reconciliation is ongoing; the window snapshot is startup-only.
    // Reopening it after each location PATCH repeats authorization/decryption
    // even though initialize already has an active destination and does nothing.
    if (session.getSnapshot().activeId) return;
    let cancelled = false;
    void (async () => {
      let restored: { id: string; href: string } | undefined;
      try {
        const raw = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
        if (raw?.format !== "minddy-local-v1") removeLocalSnapshot(sessionStorage, storageKey);
        else {
          const value = await restoreLocalSnapshot(sessionStorage, storageKey, "window-tabs");
          if (value && typeof value === "object" && "id" in value && "href" in value && typeof value.id === "string" && typeof value.href === "string") restored = { id: value.id, href: value.href };
        }
      } catch { /* Server-backed tab destinations remain available. */ }
      if (!cancelled) await session.initialize(window.location.pathname + window.location.search + window.location.hash, restored);
    })();
    return () => { cancelled = true; };
  }, [query.data, session, storageKey]);
  // A refresh hides the page first: push the pending location write out
  // immediately, or the next load restores a destination the session outgrew.
  useEffect(() => {
    const onHide = () => session.onPageHide();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHide();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [session]);
  const value = useMemo(() => ({ ...snapshot, session, loading: query.isPending,
    loadError: query.isError, reload: () => { void query.refetch(); } }), [snapshot, session, query.isPending, query.isError, query.refetch]);
  const navigation = useMemo(() => ({ session, activeId: snapshot.activeId }), [session, snapshot.activeId]);
  return <SessionContext.Provider value={session}><NavigationContext.Provider value={navigation}><Context.Provider value={value}>
    <Suspense fallback={null}><AppTabRouteSync /></Suspense>
    {children}
  </Context.Provider></NavigationContext.Provider></SessionContext.Provider>;
}

export const useOptionalAppTabs = () => useContext(Context);
export { useOptionalAppTabNavigation };
export const useOptionalAppTabSession = () => useContext(SessionContext);

/** A retained board keeps its tab's local filters while another tab is active. */
export function AppTabNavigationScope({ activeId, children }: { activeId: string | null; children: ReactNode }) {
  const session = useOptionalAppTabSession();
  const value = useMemo(() => session ? { session, activeId } : null, [session, activeId]);
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}
export function useAppTabs() {
  const value = useOptionalAppTabs();
  if (!value) throw new Error("useAppTabs requires AppTabsProvider");
  return value;
}

/** Every mounted editor, including database previews, participates in departure. */
export function useAppTabDeparture(guard: () => Promise<boolean>) {
  const session = useOptionalAppTabSession();
  useEffect(() => session?.registerDeparture(guard), [session, guard]);
}
