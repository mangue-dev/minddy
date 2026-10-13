import { isCancelledError, type Query, type QueryClient } from "@tanstack/react-query";

type ScopedPageVersion = { projectId: string; pageId: string; version: number };
type PageReadReceipt = ScopedPageVersion & { sequence: number; source: "read" | "creation"; signal?: AbortSignal };
type PageReadState = { sequence: number; pending?: { sequence: number; source: "read" | "creation"; signal?: AbortSignal }; accepted?: PageReadReceipt; acceptedWrite?: ScopedPageVersion; failure?: unknown };

// Query identity isolates accounts and retires metadata with cache eviction.
// There is no document payload, device persistence or independent body cache.
const reads = new WeakMap<Query, PageReadState>();
const observedClients = new WeakSet<QueryClient>();

export function pageReadState(query: Query | undefined): PageReadState | undefined {
  return query && reads.get(query);
}

/** Successful ordinary PATCH ingestion proves a version; manual cache updates do not. */
export function acceptPageWrite(query: Query | undefined, page: ScopedPageVersion): void {
  if (!query || query.queryKey.length !== 2 || query.queryKey[0] !== "page" ||
      query.queryKey[1] !== page.pageId || page.version <= 0) return;
  const read = reads.get(query) ?? { sequence: 0 };
  if (read.acceptedWrite && read.acceptedWrite.projectId === page.projectId &&
      read.acceptedWrite.pageId === page.pageId && read.acceptedWrite.version > page.version) return;
  read.acceptedWrite = page;
  reads.set(query, read);
}

/** Preserve a newer cache version only when an actual scoped operation accepted it. */
export function isAcceptedPageVersion(query: Query | undefined, page: ScopedPageVersion): boolean {
  const read = pageReadState(query);
  return [read?.accepted?.signal?.aborted ? undefined : read?.accepted, read?.acceptedWrite].some((accepted) => !!accepted &&
    accepted.projectId === page.projectId && accepted.pageId === page.pageId && accepted.version === page.version && page.version > 0);
}

export function beginPageRead(query: Query | undefined, signal?: AbortSignal, source: "read" | "creation" = "read"): number {
  if (!query) return 0;
  const read: PageReadState = reads.get(query) ?? { sequence: 0 };
  const sequence = ++read.sequence;
  read.pending = { sequence, signal, source };
  reads.set(query, read);
  return sequence;
}

/** Only an actual scoped GET or successful creation can accept a new write basis. */
export function acceptPageRead(query: Query | undefined, sequence: number,
  page: { projectId: string; pageId: string; version: number }, signal?: AbortSignal, source: "read" | "creation" = "read"): void {
  const read = pageReadState(query);
  if (!read || read.sequence !== sequence || signal?.aborted) return;
  read.accepted = { sequence, ...page, signal, source };
  read.failure = undefined;
}

/** Capture failures from either the shared GET or an existing raw-query owner. */
export function capturePageReadFailure(query: Query | undefined, error: unknown,
  sequence?: number, signal?: AbortSignal): void {
  if (!query || !error || isCancelledError(error) || signal?.aborted || query.queryKey.length !== 2 ||
      query.queryKey[0] !== "page" || typeof query.queryKey[1] !== "string") return;
  const read: PageReadState = reads.get(query) ?? { sequence: 0 };
  if (sequence !== undefined && read.sequence !== sequence) return;
  read.failure = error;
  reads.set(query, read);
}

export function finishPageRead(query: Query | undefined, sequence: number): void {
  const read = pageReadState(query);
  if (read?.pending?.sequence === sequence) read.pending = undefined;
}

/** Capture an unobserved Page failure before optimistic setQueryData clears it. */
export function observePageReadFailures(client: QueryClient): void {
  if (observedClients.has(client)) return;
  observedClients.add(client);
  // The account QueryCache owns this subscription; no external strong client
  // reference or cross-account callback survives disposal of that cache.
  client.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "error") return;
    capturePageReadFailure(event.query, event.query.state.error);
  });
}
