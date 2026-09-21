"use client";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useOptionalAppTabNavigation } from "@/lib/app-tab-navigation-context";
import { useCurrentViewTaggedPublication } from "@/lib/current-view-context";

export function AppTabRouteSync() {
  const path = usePathname();
  const search = useSearchParams();
  const publication = useCurrentViewTaggedPublication();
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
    // A publication only speaks for the tab that owns it: while a switch is
    // settling, the outgoing board is still mounted and still the last
    // publisher — honoring it here adopted the outgoing board's address
    // (?family=…) as the incoming tab's location. Same tab → its view href
    // refines the URL (selections the address keeps out, ?pr=…).
    const published = publication && publication.tabId === activeId ? publication.snapshot.href : null;
    // Effects publishing the page selection settle before this observation.
    const timer = setTimeout(() => session.observe(path + (search.size ? `?${search}` : "") + window.location.hash, published), 0);
    return () => clearTimeout(timer);
  }, [path, search, publication, session, activeId, hash]);
  return null;
}
