// Short code → record id, for the records this client has loaded.
//
// Visible URLs carry short codes (lib/app-urls.ts) while every query, cache
// key and comparison in the client works on full ids. Rather than threading
// each list to each URL reader, the registry learns ids from the query cache
// as data arrives, and the URL parsers expand codes through it.
//
// A code is 32 random bits, unique in practice across every record a single
// viewer sees, so one registry serves all record kinds. A code known for two
// ids is ambiguous and stays unexpanded rather than pick the wrong record.

import type { QueryClient } from "@tanstack/react-query";
import { isShortCode, isUuid, projectSegmentCode, rememberProjectKey, shortCode } from "./app-urls";

const idsByCode = new Map<string, Set<string>>();
const listeners = new Set<() => void>();
let version = 0;

function remember(id: string): boolean {
  const code = shortCode(id);
  const known = idsByCode.get(code);
  const lower = id.toLowerCase();
  if (known?.has(lower)) return false;
  if (known) known.add(lower);
  else idsByCode.set(code, new Set([lower]));
  return true;
}

const MAX_DEPTH = 4;

function walk(value: unknown, depth: number, found: { changed: boolean }) {
  if (depth > MAX_DEPTH || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, depth + 1, found);
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id === "string" && isUuid(record.id)) {
    if (remember(record.id)) found.changed = true;
    // A project row: its key makes links built from a bare id readable.
    if (typeof record.key === "string" && typeof record.owner_id === "string") {
      rememberProjectKey(record.id, record.key);
    }
  }
  for (const key in record) {
    const child = record[key];
    if (child !== null && typeof child === "object") walk(child, depth + 1, found);
  }
}

/** Learn every record id found in `value` (query data, an API response). */
export function registerRecordIds(value: unknown): void {
  const found = { changed: false };
  walk(value, 0, found);
  if (!found.changed) return;
  version += 1;
  for (const listener of listeners) listener();
}

/**
 * The full id a URL reference designates. Full UUIDs pass through, a short
 * code expands once its record is loaded and is null until then (or when
 * ambiguous), and any other value (fixture or temporary ids) is kept as is.
 */
export function expandRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  if (isUuid(ref)) return ref.toLowerCase();
  if (!isShortCode(ref)) return ref;
  const known = idsByCode.get(ref.toLowerCase());
  return known?.size === 1 ? [...known][0] : null;
}

/**
 * A URL parameter read as a record id: expanded when loaded, kept as written
 * otherwise, so a selection not loaded yet still reads as "requested" and
 * simply matches nothing until its list arrives.
 */
export function expandParam(value: string | null | undefined): string | null {
  return value ? expandRef(value) ?? value : null;
}

/** The project id a `/projects/[segment]` URL designates (see expandRef). */
export function expandProjectSegment(segment: string | null | undefined): string | null {
  return segment ? expandRef(projectSegmentCode(segment)) : null;
}

/** Listen for newly learned ids (lib/use-ref-registry-version.ts). */
export function subscribeRefRegistry(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function refRegistryVersion(): number {
  return version;
}

/** Feed the registry from everything the query cache holds, now and later. */
export function installRefRegistry(client: QueryClient): () => void {
  for (const query of client.getQueryCache().getAll()) registerRecordIds(query.state.data);
  return client.getQueryCache().subscribe((event) => {
    // `success` covers fetches and setQueryData; `setState` covers hydration
    // of the persisted cache.
    if (
      event.type === "added" ||
      (event.type === "updated" &&
        (event.action.type === "success" || event.action.type === "setState"))
    ) {
      registerRecordIds(event.query.state.data);
    }
  });
}

/** Test helper: forget every learned id. */
export function resetRefRegistry(): void {
  idsByCode.clear();
  version += 1;
}
