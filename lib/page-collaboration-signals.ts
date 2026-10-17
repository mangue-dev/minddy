"use client";

/**
 * Wake-ups for live page sessions (MIN-688).
 *
 * Each move of a stream head is broadcast on the project topic, without
 * content (`page_collaboration_heads`: page, field, revision). Typing batches
 * no longer rewrite the page row, so the head event is the only signal a
 * session needs: the realtime bridge hands it here, and a session whose
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

/** Called by the realtime bridge for each `page_collaboration_heads` event. */
export function emitPageHead(record: Record<string, unknown> | null | undefined): void {
  const pageId = typeof record?.page_id === "string" ? record.page_id : null;
  if (!pageId) return;
  const set = listeners.get(pageId);
  if (!set) return;
  const head = revision(record?.revision);
  const heads = {
    pageId,
    body: record?.field === "body" ? head : null,
    title: record?.field === "title" ? head : null,
  };
  for (const listener of set) listener(heads);
}
