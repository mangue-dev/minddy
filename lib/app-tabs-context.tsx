"use client";
import { MobileNavigationContext, useMobileNavigation } from "./mobile-navigation-context";
import { useMobileLayout } from "./use-mobile-layout";
import { createContext, Suspense, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth-context";
import { createAppTab, deleteAppTab, patchAppTab, moveAppTab } from "./app-tabs-api";
import { AppTabsSession, type AppTabsSnapshot } from "./app-tabs-session";
import { appTabsQueryKey, useAppTabsQuery } from "./use-app-tabs-query";
import { AppTabRouteSync } from "@/components/app-tab-route-sync";
import { appTabsStorageKey } from "./app-tabs-storage";
import { prefetchAppTabDestination, isPreparedAppTabDestination } from "./prefetch-tab-destination";
import { PrBackgroundSync } from "./use-pr-background";
import { createPrTabPreparation } from "./pr-tab-preparation";
import { NavigationContext, useOptionalAppTabNavigation } from "./app-tab-navigation-context";
import { SessionContext, useOptionalAppTabSession } from "./app-tab-session-context";
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

const emptySnapshot = () => null;
const noSubscription = () => () => {};
type QueryState = { session: AppTabsSession; loading: boolean; loadError: boolean; reload: () => void };

export function AppTabsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const mobile = useMobileLayout();
  const client = useQueryClient();
  const router = useRouter();
  const previous = useRef<{ owner: string; mobile: boolean } | null>(null);
  const freshSession = !previous.current || previous.current.owner !== user?.id;
  const resumeAtCurrentRoute = !freshSession && previous.current?.mobile === true;
  const owner = user?.id;
  const desktop = mobile === false && !!owner;
  // Only the desktop controller owns account queries, restoration and writes.
  const session = useMemo(() => desktop && owner ? createAccountSession(owner, client) : null, [desktop, owner, client]);
  const snapshot = useSyncExternalStore(session?.subscribe ?? noSubscription, session?.getSnapshot ?? emptySnapshot, session?.getSnapshot ?? emptySnapshot);
  const [queryState, setQueryState] = useState<QueryState | null>(null);
  const mobileNavigation = useMemo(() => {
    const guards = new Set<() => Promise<boolean>>();
    let pending = false;
    return {
      registerDeparture: (guard: () => Promise<boolean>) => { guards.add(guard); return () => { guards.delete(guard); }; },
      open: (navigate: () => void) => {
        if (pending) return;
        pending = true;
        void (async () => {
          try {
            for (const guard of guards) if (!(await guard())) return;
            navigate();
          } catch (error) { console.error("Unable to save before navigation", error); }
          finally { pending = false; }
        })();
      },
    };
  }, [user?.id]);
  useEffect(() => {
    if (!user) { previous.current = null; return; }
    if (mobile === undefined) return;
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    // Reload-to-Home belongs to a fresh mobile session, never a rotation.
    if (mobile && freshSession && navigation?.type === "reload" && window.location.pathname !== "/home") router.replace("/home");
    previous.current = { owner: user.id, mobile };
  }, [user, mobile, freshSession, router]);
  const value = useMemo(() => session && snapshot ? {
    ...snapshot, session,
    loading: queryState?.session === session ? queryState.loading : true,
    loadError: queryState?.session === session ? queryState.loadError : false,
    reload: queryState?.session === session ? queryState.reload : () => {},
  } : null, [session, snapshot, queryState]);
  const navigation = useMemo(() => session ? { session, activeId: snapshot?.activeId ?? null } : null, [session, snapshot?.activeId]);
  // Keep the provider topology and descendant drafts stable across layout changes.
  return <SessionContext.Provider key={owner ?? "signed-out"} value={session}><NavigationContext.Provider value={navigation}>
    <Context.Provider value={value}><MobileNavigationContext.Provider value={owner && mobile === true ? mobileNavigation : null}>
      {session && owner ? <AccountTabSync key={owner} owner={owner} session={session} resumeAtCurrentRoute={resumeAtCurrentRoute} onQueryState={setQueryState} /> : null}
      {session ? <PrBackgroundSync /> : null}
      {session ? <Suspense fallback={null}><AppTabRouteSync /></Suspense> : null}
      {children}
    </MobileNavigationContext.Provider></Context.Provider>
  </NavigationContext.Provider></SessionContext.Provider>;
}

function createAccountSession(owner: string, client: QueryClient) {
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
}

function AccountTabSync({ owner, session, resumeAtCurrentRoute, onQueryState }: {
  owner: string; session: AppTabsSession; resumeAtCurrentRoute: boolean;
  onQueryState: (state: QueryState) => void;
}) {
  const keepCurrentRoute = useRef(resumeAtCurrentRoute).current;
  const client = useQueryClient();
  const router = useRouter();
  const query = useAppTabsQuery(owner);
  const storageKey = appTabsStorageKey(owner);
  useLayoutEffect(() => {
    onQueryState({ session, loading: query.isPending, loadError: query.isError, reload: () => { void query.refetch(); } });
  }, [session, query.isPending, query.isError, query.refetch, onQueryState]);
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
      if (session.isRetainedDestination(session.getSnapshot().activeId, href) || isPreparedAppTabDestination(client, href) ||
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
        if (!keepCurrentRoute) {
          const raw = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
          if (raw?.format !== "minddy-local-v1") removeLocalSnapshot(sessionStorage, storageKey);
          else {
            const value = await restoreLocalSnapshot(sessionStorage, storageKey, "window-tabs");
            if (value && typeof value === "object" && "id" in value && "href" in value && typeof value.id === "string" && typeof value.href === "string") restored = { id: value.id, href: value.href };
          }
        }
      } catch { /* Server-backed tab destinations remain available. */ }
      if (!cancelled) await session.initialize(window.location.pathname + window.location.search + window.location.hash, restored, keepCurrentRoute);
    })();
    return () => { cancelled = true; };
  }, [query.data, session, storageKey, keepCurrentRoute]);
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
  return null;
}

export const useOptionalAppTabs = () => useContext(Context);
export { useOptionalAppTabNavigation };
export { useOptionalAppTabSession };

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
  const mobile = useMobileNavigation();
  useEffect(() => session?.registerDeparture(guard) ?? mobile?.registerDeparture(guard), [session, mobile, guard]);
}
