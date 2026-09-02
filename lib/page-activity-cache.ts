/** Keep an intent-prefetched activity panel warm without hiding live updates. */
export const PAGE_ACTIVITY_FRESH_MS = 30_000;

export const pageEventsKey = (pageId: string) =>
  ["page-events", pageId] as const;

export const pageBacklinksKey = (pageId: string) =>
  ["page-backlinks", pageId] as const;
