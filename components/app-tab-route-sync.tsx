"use client";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useOptionalAppTabNavigation } from "@/lib/app-tabs-context";
import { useCurrentViewSnapshot } from "@/lib/current-view-context";

export function AppTabRouteSync() {
  const path = usePathname();
  const search = useSearchParams();
  const view = useCurrentViewSnapshot();
  const { session, activeId } = useOptionalAppTabNavigation()!;
  // In-page anchors move the URL without touching path or search: without
  // tracking them, the remembered destination misses the hash and a reload
  // reads the URL as an unmatched deep link — which used to grind the first
  // tab under it.
  const [hash, setHash] = useState("");
  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => {
    // Effects publishing the page selection settle before this observation.
    const timer = setTimeout(() => session.observe(path + (search.size ? `?${search}` : "") + window.location.hash, view?.href ?? null), 0);
    return () => clearTimeout(timer);
  }, [path, search, view, session, activeId, hash]);
  return null;
}
