"use client";
import { useCallback, useEffect, useRef } from "react";
import { useMobileCollectionState } from "@/lib/mobile-collection-state";
import { collectionFilterParams, readCollectionFilters, type CollectionFilters } from "@/lib/collection-filters";

/** Keep collection filters in saved destinations and mobile browse sessions. */
export function useCollectionFilters(pathname: string, params: URLSearchParams, browse = false) {
  const [filters, setFilters] = useMobileCollectionState<CollectionFilters>(pathname, "properties", () => readCollectionFilters(params));
  const signature = collectionFilterParams(readCollectionFilters(params), new URLSearchParams()).toString();
  const previous = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (previous.current === signature) return;
    const initial = previous.current === undefined;
    previous.current = signature;
    if (!initial || signature) setFilters(readCollectionFilters(new URLSearchParams(signature)));
  }, [signature, setFilters]);
  const change = useCallback((next: CollectionFilters) => {
    setFilters(next);
    if (!browse && window.location.pathname === pathname) {
      const query = collectionFilterParams(next, new URLSearchParams(window.location.search)).toString();
      window.history.replaceState(window.history.state, "", pathname + (query ? `?${query}` : "") + window.location.hash);
    }
  }, [setFilters, browse, pathname]);
  return [filters, change] as const;
}
