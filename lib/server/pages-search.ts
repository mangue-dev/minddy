import "server-only";

import type { JSONContent } from "@tiptap/core";

import { afterOrNow } from "@/lib/server/after-safe";
import { getServiceClient } from "@/lib/supabase-service";
import { pageBodyToMarkdownServer } from "@/lib/server/pages-projection";
import type { PageSearchHit } from "@/lib/types";

export type { PageSearchHit };

/**
 * The DERIVED column that makes the wiki searchable (MIN-276).
 *
 * `pages.search_text` is the Markdown projection of the ProseMirror body, and
 * the generated `pages.search_tsv` index is derived from it for PostgreSQL queries.
 * The text also powers the EXCERPT (`ts_headline`), the sentence that explains why
 * a page matched; this dual use is why we keep a text column rather than only a
 * `tsvector`.
 *
 * Two rules keep it honest:
 *
 * 1. **the client never writes it.** A derived column supplied by the caller
 * becomes stale when a client is outdated or a write path forgets to fill it.
 * It is calculated here from what is IN THE DATABASE.
 * 2. **it is RE-READ before being written** (`syncPagesSearchText` reloads the
 * body). It costs a query, and it buys idempotence: replaying the
 * projection on a page cannot make it diverge, whatever
 * the order in which two concurrent writes catch up.
 *
 * It also stays off the critical path. The editor's save is already debounced by a
 * second; adding server-side Tiptap setup would slow every save for text no one is
 * waiting on. `afterOrNow` pushes the work past the response and falls back to
 * immediate execution outside a request (cascading MCP calls or a catch-up script).
 */

type Service = ReturnType<typeof getServiceClient>;

/** The indexed text of a page body: its markdown projection, nothing else. */
export async function pageSearchText(content: unknown): Promise<string> {
  const markdown = await pageBodyToMarkdownServer(
    (content as JSONContent | null) ?? null
  );
  return markdown.trim();
}

/**
 * Recalculates `search_text` for these pages from their database content.
 *
 * The write targets only the derived column: neither `content` nor `version`.
 * Going back through the body would replay the version guard of MIN-271 against
 * itself — the catch-up write would be rejected by the write it follows, or worse,
 * would overwrite a save made in between.
 */
export async function syncPagesSearchText(
  service: Service,
  pageIds: string[]
): Promise<void> {
  if (pageIds.length === 0) return;

  const { data, error } = await service
    .from("pages")
    .select("id, content")
    .in("id", pageIds);
  if (error) {
    console.error("[pages] search text read failed:", error.message);
    return;
  }

  for (const row of (data ?? []) as { id: string; content: unknown }[]) {
    const text = await pageSearchText(row.content);
    const { error: writeError } = await service
      .from("pages")
      .update({ search_text: text })
      .eq("id", row.id);
    if (writeError) {
      console.error("[pages] search text write failed:", writeError.message);
    }
  }
}

/** The same work, after the response. The only caller used by write paths. */
export function queueSearchText(service: Service, pageIds: string[]): void {
  if (pageIds.length === 0) return;
  afterOrNow(() => syncPagesSearchText(service, pageIds));
}

/* ─── Lecture ──────────────────────────────────────────────────────────────── */

/** What the SQL function renders, before cleaning the extract. */
type RawHit = Omit<PageSearchHit, "excerpt"> & { excerpt: string | null };

/**
 * The excerpt as displayed. `ts_headline` works on the page's MARKDOWN: its
 * bullets, hash marks, and newlines have no meaning in a palette row or tool result.
 * We flatten them here rather than during indexing — the indexed text must remain
 * the page's original text.
 */
function cleanExcerpt(raw: string | null): string {
  if (!raw) return "";
  return raw
    .replace(/```[a-z]*|\[\[page:[^\]]*\]\]/gi, " ")
    .replace(/^[\s>#*_-]+/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Search without access control — that belongs to the callers.
 *
 * Two clients call it, and the difference is substantive: for the SESSION client,
 * `pages_select` filters the function by the user's projects (this is ⌘K's
 * cross-project search); for the SERVICE client it does not, so `projectId` is
 * mandatory — the guard is applied earlier in TypeScript.
 */
/**
 * The maximum length of the search string (MIN-348).
 *
 * It goes to `websearch_to_tsquery` and then to `ts_headline`, which compares
 * every query lexeme with every candidate page. Cost grows with the query length,
 * and nothing limited what a client could send. Two hundred characters is already
 * longer than a typical human search, so we TRUNCATE instead of rejecting: an
 * accidental paste should return results, not an error.
 */
export const MAX_SEARCH_QUERY_LENGTH = 200;

/** The maximum number of results — the “1–50” advertised by the MCP tool
    whose schema did not previously enforce it (MIN-348). */
export const MAX_SEARCH_LIMIT = 50;

export async function runPageSearch(
  client: {
    rpc: (
      name: string,
      args: Record<string, unknown>
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  },
  {
    query,
    projectId = null,
    limit = 20,
  }: { query: string; projectId?: string | null; limit?: number }
): Promise<{ ok: true; hits: PageSearchHit[] } | { ok: false }> {
  const { data, error } = await client.rpc("search_pages", {
    p_query: query.slice(0, MAX_SEARCH_QUERY_LENGTH),
    p_project_id: projectId,
    p_limit: Math.min(Math.max(1, Math.trunc(limit) || 1), MAX_SEARCH_LIMIT),
  });
  if (error) {
    console.error("[pages] search failed:", error.message);
    return { ok: false };
  }
  const hits = ((data ?? []) as RawHit[]).map((hit) => ({
    ...hit,
    excerpt: cleanExcerpt(hit.excerpt),
  }));
  return { ok: true, hits };
}
