import { fetchClientRead } from "./client-read";
import type { PromptPullRequest, PromptRepository } from "./issue-prompt";

/**
 * Forge context the copied issue prompts carry (MIN-719): linked pull
 * requests and the project's repository, read from minddy when the user
 * copies — no forge call, no paid generation.
 *
 * Copying must stay instant and must never fail because of it (MIN-723).
 * The read is therefore warmed on intent (`prefetchIssuePromptContext` on
 * hover, focus, panel open or selection) and kept briefly; a copy serves the
 * cached entry at once and waits at most `PROMPT_CONTEXT_COPY_WAIT_MS` for a
 * missing one. Anything not ready by then — or any failure — degrades to
 * "unavailable" (`pullRequests: null`), which the prompt states instead of
 * claiming there is no pull request, while the read finishes for the next
 * copy.
 */
export interface IssuePromptForgeContext {
  pullRequests: PromptPullRequest[] | null;
  repository: PromptRepository | null;
}

/** Deadline of the background read itself, not of the copy. */
export const PROMPT_CONTEXT_TIMEOUT_MS = 2500;
/** Longest a copy waits for context that is not cached yet. */
export const PROMPT_CONTEXT_COPY_WAIT_MS = 300;
/** Linked pull requests rarely change; a short lifetime keeps them fresh. */
export const PROMPT_CONTEXT_TTL_MS = 30_000;
/** Sweeping the pointer across a board coalesces into one request per window. */
export const PROMPT_CONTEXT_PREFETCH_BATCH_MS = 150;
const MAX_ISSUES = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const UNAVAILABLE_FORGE_CONTEXT: IssuePromptForgeContext = {
  pullRequests: null,
  repository: null,
};

interface CacheEntry {
  /** Settles with the issue's context, or null when it could not be read. */
  promise: Promise<IssuePromptForgeContext | null>;
  value?: IssuePromptForgeContext;
  loadedAt?: number;
}

// Entries are only ever served for issues the user is looking at, and the
// server returns context for visible issues only, so a short-lived module
// cache does not widen access.
const entries = new Map<string, CacheEntry>();
const queued = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function persistedIds(issueIds: readonly string[]): string[] {
  // Optimistic issues carry temporary ids the server has never seen.
  return [...new Set(issueIds)].filter((id) => UUID.test(id));
}

/** A settled entry past its lifetime is dropped; an in-flight one is kept. */
function liveEntry(id: string): CacheEntry | undefined {
  const entry = entries.get(id);
  if (entry?.loadedAt !== undefined && Date.now() - entry.loadedAt > PROMPT_CONTEXT_TTL_MS) {
    entries.delete(id);
    return undefined;
  }
  return entry;
}

async function requestContext(
  ids: readonly string[],
): Promise<Map<string, IssuePromptForgeContext>> {
  try {
    const response = await fetchClientRead(
      `/api/issues/prompt-context?ids=${ids.join(",")}`,
      { cache: "no-store" },
      { timeoutMs: PROMPT_CONTEXT_TIMEOUT_MS },
    );
    if (!response.ok) return new Map();
    const body = (await response.json()) as {
      issues?: Record<string, IssuePromptForgeContext>;
    };
    return new Map(Object.entries(body.issues ?? {}));
  } catch {
    return new Map();
  }
}

/** Starts one read per 50 ids that are neither cached nor in flight. */
function startReads(issueIds: readonly string[]): void {
  const missing = issueIds.filter((id) => !liveEntry(id));
  for (let start = 0; start < missing.length; start += MAX_ISSUES) {
    const batch = missing.slice(start, start + MAX_ISSUES);
    const read = requestContext(batch);
    for (const id of batch) {
      const entry: CacheEntry = {
        promise: read.then((context) => {
          const value = context.get(id);
          // Failures and omitted issues are not cached: the next copy retries.
          if (!value) {
            if (entries.get(id) === entry) entries.delete(id);
            return null;
          }
          entry.value = value;
          entry.loadedAt = Date.now();
          return value;
        }),
      };
      entries.set(id, entry);
    }
  }
}

/**
 * Warms the context of issues the user is about to copy. Calls within a
 * short window share one request; cached and in-flight issues cost nothing.
 */
export function prefetchIssuePromptContext(issueIds: readonly string[]): void {
  for (const id of persistedIds(issueIds)) {
    if (!liveEntry(id)) queued.add(id);
  }
  if (queued.size === 0 || flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const ids = [...queued];
    queued.clear();
    startReads(ids);
  }, PROMPT_CONTEXT_PREFETCH_BATCH_MS);
}

/**
 * Forge context per issue id for a copy; an issue missing from the map is
 * unavailable. Cached issues answer immediately; the others are read and
 * waited for at most `PROMPT_CONTEXT_COPY_WAIT_MS`.
 */
export async function loadIssuePromptContext(
  issueIds: readonly string[],
): Promise<Map<string, IssuePromptForgeContext>> {
  const ids = persistedIds(issueIds).slice(0, MAX_ISSUES);
  startReads(ids);
  const pending = ids.flatMap((id) => {
    const entry = entries.get(id);
    return entry && !entry.value ? [entry.promise] : [];
  });
  if (pending.length > 0) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.all(pending),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, PROMPT_CONTEXT_COPY_WAIT_MS);
      }),
    ]);
    clearTimeout(timer);
  }
  const context = new Map<string, IssuePromptForgeContext>();
  for (const id of ids) {
    const value = entries.get(id)?.value;
    if (value) context.set(id, value);
  }
  return context;
}

/** Forge context of ONE issue, unavailable on any failure or delay. */
export async function loadOneIssuePromptContext(
  issueId: string,
): Promise<IssuePromptForgeContext> {
  return (await loadIssuePromptContext([issueId])).get(issueId) ?? UNAVAILABLE_FORGE_CONTEXT;
}

/** Test seam: forgets every cached, in-flight and queued read. */
export function resetIssuePromptContextCache(): void {
  entries.clear();
  queued.clear();
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
}
