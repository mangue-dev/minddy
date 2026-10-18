"use client";

/**
 * Wake-ups for live descriptions (MIN-728), the counterpart of
 * lib/page-collaboration-signals.ts. Each head move of a description's
 * stream is broadcast on the project topic without content
 * (`rich_document_heads`: kind, document, revision); the realtime bridge hands
 * it here, and a session that is behind reads the missing steps over HTTP.
 */

type Listener = (revision: number | null) => void;

const listeners = new Map<string, Set<Listener>>();

const keyOf = (kind: string, id: string) => `${kind}:${id}`;

export function onDocumentHead(kind: string, id: string, listener: Listener): () => void {
  const key = keyOf(kind, id);
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => {
    const current = listeners.get(key);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(key);
  };
}

/** Called by the realtime bridge for each `rich_document_heads` event. */
export function emitDocumentHead(record: Record<string, unknown> | null | undefined): void {
  const kind = typeof record?.kind === "string" ? record.kind : null;
  const id = typeof record?.document_id === "string" ? record.document_id : null;
  if (!kind || !id) return;
  const set = listeners.get(keyOf(kind, id));
  if (!set) return;
  const revision = typeof record?.revision === "number" && Number.isSafeInteger(record.revision)
    ? record.revision : null;
  for (const listener of set) listener(revision);
}
