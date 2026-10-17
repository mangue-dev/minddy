"use client";

/**
 * Wake-ups for live page sessions (MIN-688).
 *
 * The database already broadcasts every page row change on the project topic,
 * without content (`broadcast_page_row`). Since MIN-688 that row carries the
 * stream heads (`body_revision`, `title_revision`), which is all a session
 * needs: the realtime bridge hands each pages event here, and a session whose
 * revision is behind reads the missing steps over HTTP. No document travels
 * through Realtime.
 *
 * While a page has a live session, its document is the session's. The bridge
 * consults `hasLivePageSession` and skips refetching the whole `["page", id]`
 * document on each typing batch — the session already has those steps.
 */

export interface PageStreamHeads {
  pageId: string;
  body: number | null;
  title: number | null;
}

type Listener = (heads: PageStreamHeads) => void;

const listeners = new Map<string, Set<Listener>>();

export function onPageStreamHeads(pageId: string, listener: Listener): () => void {
  let set = listeners.get(pageId);
  if (!set) {
    set = new Set();
    listeners.set(pageId, set);
  }
  set.add(listener);
  return () => {
    const current = listeners.get(pageId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(pageId);
  };
}

export function hasLivePageSession(pageId: string): boolean {
  return listeners.has(pageId);
}

const revision = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) ? value : null;

/** Called by the realtime bridge for each `pages` row event. */
export function emitPageRow(record: Record<string, unknown> | null | undefined): void {
  const pageId = typeof record?.id === "string" ? record.id : null;
  if (!pageId) return;
  const set = listeners.get(pageId);
  if (!set) return;
  const heads = { pageId, body: revision(record?.body_revision), title: revision(record?.title_revision) };
  for (const listener of set) listener(heads);
}
