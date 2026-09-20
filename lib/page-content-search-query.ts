import type { PageSearchHit } from "./types";

/** Bound abandoned content searches; the account-wide title index is separate. */
export const PAGE_CONTENT_SEARCH_GC_MS = 60_000;

export function pageContentSearchQuery(query: string) {
  return {
    queryKey: ["me", "pages", "search", query] as const,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<PageSearchHit[]> => {
      const response = await fetch(`/api/me/pages/search?q=${encodeURIComponent(query)}`, { signal });
      if (!response.ok) return [];
      const data: unknown = await response.json();
      return Array.isArray(data) ? data as PageSearchHit[] : [];
    },
    staleTime: 30_000,
    gcTime: PAGE_CONTENT_SEARCH_GC_MS,
  };
}
