import { isCancelledError, type Query, type QueryClient } from "@tanstack/react-query";

type PageReadReceipt = { sequence: number; projectId: string; pageId: string; version: number; signal?: AbortSignal };
type PageReadState = { sequence: number; pending?: { sequence: number; signal?: AbortSignal }; accepted?: PageReadReceipt; failure?: unknown };

// Query identity isolates accounts and retires metadata with cache eviction.
// There is no document payload, device persistence or independent body cache.
const reads = new WeakMap<Query, PageReadState>();
const observedClients = new WeakSet<QueryClient>();

export function pageReadState(query: Query | undefined): PageReadState | undefined {
  return query && reads.get(query);
}

export function beginPageRead(query: Query | undefined, signal?: AbortSignal): number {
  if (!query) return 0;
  const read: PageReadState = reads.get(query) ?? { sequence: 0 };
  const sequence = ++read.sequence;
  read.pending = { sequence, signal };
  reads.set(query, read);
  return sequence;
}

/** Only the scoped, non-aborted GET owner can accept a new write basis. */
export function acceptPageRead(query: Query | undefined, sequence: number,
  page: { projectId: string; pageId: string; version: number }, signal?: AbortSignal): void {
  const read = pageReadState(query);
  if (!read || read.sequence !== sequence || signal?.aborted) return;
  read.accepted = { sequence, ...page, signal };
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
