"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchAppTabs } from "./app-tabs-api";
export const appTabsQueryKey = (owner: string) => ["app-tabs", owner] as const;
export function useAppTabsQuery(owner: string) {
  return useQuery({ queryKey: appTabsQueryKey(owner), queryFn: ({ signal }) => fetchAppTabs(signal),
    refetchOnWindowFocus: true, staleTime: 30_000 });
}
