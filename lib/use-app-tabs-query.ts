"use client";
import { useEffect, useRef } from "react";
import { queryOptions, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { AppTabRequestError, fetchAppTabs } from "./app-tabs-api";
import { CLIENT_READ_TIMEOUT_MS, prepareClientSession } from "./client-read";
import { withClientRequestDeadline } from "./client-request-deadline";
export const appTabsQueryKey = (owner: string) => ["app-tabs", owner] as const;

export function appTabsQueryOptions(owner: string) {
  return queryOptions({
    queryKey: appTabsQueryKey(owner),
    queryFn: ({ signal }) => withClientRequestDeadline(async (readSignal) => {
      // The SDK can finish changing accounts before the React owner updates.
      // Bind even an empty canonical response to the requested account key.
      if (await prepareClientSession() !== owner) throw new AppTabRequestError("account_changed");
      readSignal.throwIfAborted();
      const tabs = await fetchAppTabs(readSignal);
      if (await prepareClientSession() !== owner) throw new AppTabRequestError("account_changed");
      readSignal.throwIfAborted();
      if (!Array.isArray(tabs) || tabs.some((tab) => !tab || tab.user_id !== owner)) throw new AppTabRequestError("account_changed");
      return tabs;
    }, CLIENT_READ_TIMEOUT_MS, signal),
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

export function useAppTabsQuery(owner: string) {
  const client = useQueryClient();
  const lifetime = useRef<{ client: QueryClient; owner: string; active: boolean } | null>(null);
  useEffect(() => {
    let current = lifetime.current;
    if (!current || current.client !== client || current.owner !== owner) {
      current = { client, owner, active: false };
      lifetime.current = current;
    }
    const activeOwner = current;
    activeOwner.active = true;
    // Canonical tabs are not persisted. Read them while the optional query
    // snapshot opens, sharing the ordinary observer's key and freshness policy.
    void client.prefetchQuery(appTabsQueryOptions(owner));
    const query = client.getQueryCache().find({ queryKey: appTabsQueryKey(owner), exact: true });
    const operation = query?.promise;
    return () => {
      activeOwner.active = false;
      queueMicrotask(() => {
        // Effect replay keeps this owner alive. A real retirement cancels only
        // its exact operation, never a replacement or a foreground observer.
        if (activeOwner.active || !query || query.isActive() || query.state.fetchStatus !== "fetching" || query.promise !== operation ||
            client.getQueryCache().find({ queryKey: appTabsQueryKey(owner), exact: true }) !== query) return;
        void client.cancelQueries({ queryKey: appTabsQueryKey(owner), exact: true });
      });
    };
  }, [client, owner]);
  return useQuery(appTabsQueryOptions(owner));
}
