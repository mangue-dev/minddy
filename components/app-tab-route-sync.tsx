"use client";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAppTabs } from "@/lib/app-tabs-context";
import { useCurrentViewSnapshot } from "@/lib/current-view-context";

export function AppTabRouteSync() {
  const path = usePathname();
  const search = useSearchParams();
  const view = useCurrentViewSnapshot();
  const { session, activeId } = useAppTabs();
  useEffect(() => {
    // Effects publishing the page selection settle before this observation.
    const timer = setTimeout(() => session.observe(path + (search.size ? `?${search}` : "") + window.location.hash, view?.href ?? null), 0);
    return () => clearTimeout(timer);
  }, [path, search, view, session, activeId]);
  return null;
}
