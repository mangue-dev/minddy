"use client";
import { createContext, Suspense, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth-context";
import { createAppTab, deleteAppTab, patchAppTab } from "./app-tabs-api";
import { AppTabsSession, type AppTabsSnapshot } from "./app-tabs-session";
import { appTabsQueryKey, useAppTabsQuery } from "./use-app-tabs-query";
import { AppTabRouteSync } from "@/components/app-tab-route-sync";
import { appTabsStorageKey } from "./app-tabs-storage";

interface AppTabsValue extends AppTabsSnapshot {
  session: AppTabsSession;
  loading: boolean;
  loadError: boolean;
  reload: () => void;
}
const Context = createContext<AppTabsValue | null>(null);

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
    });
    controller.onDispose = () => abort.abort();
    return controller;
  }, [owner, client]);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const mounted = useRef(false);
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
    session.navigate = (href) => {
      const current = window.location.pathname;
      const next = href.split(/[?#]/)[0];
      const wikiRoot = current.match(/^\/projects\/[^/]+\/pages(?:\/|$)/)?.[0].replace(/\/$/, "");
      if (wikiRoot && (next === wikiRoot || next.startsWith(`${wikiRoot}/`))) window.history.pushState(null, "", href);
      else router.push(href, { scroll: false });
    };
    session.remember = (id, href) => {
      try { sessionStorage.setItem(storageKey, JSON.stringify({ id, href })); } catch { /* Storage is optional. */ }
    };
  }, [router, session, storageKey]);
  useEffect(() => {
    if (!query.data) return;
    session.receive(query.data);
    let restored: { id: string; href: string } | undefined;
    try { restored = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") ?? undefined; } catch { /* Ignore a malformed snapshot. */ }
    void session.initialize(window.location.pathname + window.location.search + window.location.hash, restored);
  }, [query.data, session, storageKey]);
  const value = useMemo(() => ({ ...snapshot, session, loading: query.isPending,
    loadError: query.isError, reload: () => { void query.refetch(); } }), [snapshot, session, query.isPending, query.isError, query.refetch]);
  return <Context.Provider value={value}>
    <Suspense fallback={null}><AppTabRouteSync /></Suspense>
    {children}
  </Context.Provider>;
}

export const useOptionalAppTabs = () => useContext(Context);
export function useAppTabs() {
  const value = useOptionalAppTabs();
  if (!value) throw new Error("useAppTabs requires AppTabsProvider");
  return value;
}

/** Every mounted editor, including database previews, participates in departure. */
export function useAppTabDeparture(guard: () => Promise<boolean>) {
  const session = useOptionalAppTabs()?.session;
  useEffect(() => session?.registerDeparture(guard), [session, guard]);
}
