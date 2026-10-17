import "server-only";

import type { CollabField } from "@/lib/page-collaboration";

/**
 * The stream values this process last accepted (MIN-688), so a typist's next
 * batch is validated without reading and decrypting the page again.
 *
 * A stream's value is a function of (page, field, revision): every writer that
 * changes the body or the title advances the revision, a gap included, and
 * revisions never repeat. An entry can therefore only be stale by being
 * behind, which the commit's head comparison catches (`behind`); it can never
 * validate steps against the wrong document.
 *
 * Entries hold decrypted page text in this process's memory only, never in a
 * log or a client store. They are used after the request's access decision,
 * for the project they were read under, and expire after a short idle time.
 */

const TTL_MS = 60_000;
const MAX_ENTRIES = 128;

interface Entry {
  projectId: string;
  revision: number;
  /** The body JSON or the title string at `revision`. */
  value: unknown;
  /** Whether the page is sealed: its journal batches must be too. */
  protect: boolean;
  expiresAt: number;
}

const entries = new Map<string, Entry>();

const keyOf = (pageId: string, field: CollabField) => `${pageId}:${field}`;

/** The value at exactly `revision`, or null. */
export function cachedStreamValue(
  pageId: string,
  projectId: string,
  field: CollabField,
  revision: number,
  now = Date.now()
): { value: unknown; protect: boolean } | null {
  const key = keyOf(pageId, field);
  const entry = entries.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    entries.delete(key);
    return null;
  }
  if (entry.projectId !== projectId || entry.revision !== revision) return null;
  return { value: entry.value, protect: entry.protect };
}

export function rememberStreamValue(
  pageId: string,
  projectId: string,
  field: CollabField,
  revision: number,
  value: unknown,
  protect: boolean,
  now = Date.now()
): void {
  const key = keyOf(pageId, field);
  const current = entries.get(key);
  // Never move an entry backwards: a slower request may finish after a newer one.
  if (current && current.projectId === projectId && current.revision > revision &&
      current.expiresAt > now) return;
  entries.delete(key);
  while (entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
  entries.set(key, { projectId, revision, value, protect, expiresAt: now + TTL_MS });
}

/** Drops a page's entries (trash, tests). */
export function forgetStreamValues(pageId?: string): void {
  if (pageId === undefined) {
    entries.clear();
    return;
  }
  entries.delete(keyOf(pageId, "body"));
  entries.delete(keyOf(pageId, "title"));
}
