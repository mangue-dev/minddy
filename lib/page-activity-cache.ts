import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { fetchPageBacklinksApi, fetchPageEventsApi } from "./pages-api";

/** Keep an intent-prefetched activity panel warm without hiding live updates. */
export const PAGE_ACTIVITY_FRESH_MS = 30_000;

export const pageEventsKey = (pageId: string) =>
  ["page-events", pageId] as const;

export const pageBacklinksKey = (pageId: string) =>
  ["page-backlinks", pageId] as const;

/**
 * Warm the activity panel once per surface activation (mount, reveal, page
 * switch). An accepted save replaces the page object but not the activation,
 * and an open panel stays fresh through its own observer and realtime. The
 * returned callback is the hover and focus warm.
 */
export function usePageActivityWarmup(projectId: string, pageId: string, page: unknown): () => void {
  const queryClient = useQueryClient();
  const loaded = !!page;
  const warm = useCallback(() => {
    void queryClient.prefetchQuery({
      queryKey: pageEventsKey(pageId),
      queryFn: () => fetchPageEventsApi(projectId, pageId),
      staleTime: PAGE_ACTIVITY_FRESH_MS,
    });
    void queryClient.prefetchQuery({
      queryKey: pageBacklinksKey(pageId),
      queryFn: () => fetchPageBacklinksApi(projectId, pageId),
      staleTime: PAGE_ACTIVITY_FRESH_MS,
    });
  }, [pageId, projectId, queryClient]);
  useEffect(() => {
    if (loaded) warm();
  }, [loaded, warm]);
  return warm;
}
