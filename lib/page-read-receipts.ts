import { isCancelledError, type Query, type QueryClient } from "@tanstack/react-query";

type ScopedPageVersion = { projectId: string; pageId: string; version: number; updatedAt?: string };
type PageReadReceipt = ScopedPageVersion & { sequence: number; source: "read" | "creation"; signal?: AbortSignal };
type PageReadState = { sequence: number; pending?: { sequence: number; source: "read" | "creation"; signal?: AbortSignal }; accepted?: PageReadReceipt; acceptedWrite?: ScopedPageVersion; newestMetadata?: ScopedPageVersion & { signal?: AbortSignal }; failure?: unknown };

// Query identity isolates accounts and retires metadata with cache eviction.
// There is no document payload, device persistence or independent body cache.
const reads = new WeakMap<Query, PageReadState>();
const observedClients = new WeakSet<QueryClient>();

export function pageReadState(query: Query | undefined): PageReadState | undefined {
  return query && reads.get(query);
}

/** Order actual server metadata without using a client cache timestamp. */
export function isNewerPageMetadata(candidate: { version: number; updatedAt: string },
  current: { version: number; updatedAt: string }): boolean {
  if (candidate.version !== current.version) return candidate.version > current.version;
  const candidateAt = Date.parse(candidate.updatedAt), currentAt = Date.parse(current.updatedAt);
  if (!Number.isFinite(candidateAt) || !Number.isFinite(currentAt)) return false;
  if (candidateAt !== currentAt) return candidateAt > currentAt;
  // PostgreSQL timestamps retain finer precision than JavaScript milliseconds.
  const fraction = (value: string) => (value.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/)?.[1] ?? "").padEnd(9, "0");
  return fraction(candidate.updatedAt) > fraction(current.updatedAt);
}

function acceptMetadata(read: PageReadState, page: ScopedPageVersion, signal?: AbortSignal): void {
  if (!page.updatedAt || !Number.isFinite(Date.parse(page.updatedAt))) return;
  const current = read.newestMetadata;
  if (!current || current.signal?.aborted || !current.updatedAt ||
      isNewerPageMetadata({ version: page.version, updatedAt: page.updatedAt },
        { version: current.version, updatedAt: current.updatedAt })) {
    read.newestMetadata = { ...page, signal };
  }
}

/** Reject older metadata; this never certifies cached fields or a write basis. */
export function hasNewerAcceptedPageMetadata(query: Query | undefined, page: ScopedPageVersion): boolean {
  const read = pageReadState(query);
  if (!page.updatedAt) return false;
  return [read?.newestMetadata?.signal?.aborted ? undefined : read?.newestMetadata, read?.acceptedWrite].some((accepted) =>
    !!accepted?.updatedAt && accepted.projectId === page.projectId && accepted.pageId === page.pageId &&
    isNewerPageMetadata({ version: accepted.version, updatedAt: accepted.updatedAt },
      { version: page.version, updatedAt: page.updatedAt! }));
}

/** Successful ordinary PATCH ingestion proves a version; manual cache updates do not. */
export function acceptPageWrite(query: Query | undefined, page: ScopedPageVersion): void {
  if (!query || query.queryKey.length !== 2 || query.queryKey[0] !== "page" ||
      query.queryKey[1] !== page.pageId || page.version <= 0) return;
  const read = reads.get(query) ?? { sequence: 0 };
  if (read.acceptedWrite && read.acceptedWrite.projectId === page.projectId &&
      read.acceptedWrite.pageId === page.pageId && read.acceptedWrite.version > page.version) return;
  read.acceptedWrite = page;
  acceptMetadata(read, page);
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
  page: ScopedPageVersion, signal?: AbortSignal, source: "read" | "creation" = "read"): void {
  const read = pageReadState(query);
  if (!read || read.sequence !== sequence || signal?.aborted) return;
  read.accepted = { sequence, ...page, signal, source };
  acceptMetadata(read, page, signal);
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
