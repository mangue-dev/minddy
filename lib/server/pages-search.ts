import "server-only";

import type { JSONContent } from "@tiptap/core";
import type { SupabaseClient } from "@supabase/supabase-js";

import { afterOrNow } from "@/lib/server/after-safe";
import { getServiceClient } from "@/lib/supabase-service";
import { pageBodyToMarkdownServer } from "@/lib/server/pages-projection";
import type { PageSearchHit } from "@/lib/types";
import { decodePageProjection, shouldProtectPages } from "./page-content";

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
    .select("id, project_id, content, encrypted_content, encryption_version")
    .in("id", pageIds);
  if (error) {
    console.error("[pages] search text read failed:", error.message);
    return;
  }

  for (const row of data ?? []) {
    if (row.encryption_version > 0) continue;
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
  client: SupabaseClient,
  {
    query,
    projectId = null,
    limit = 20,
  }: { query: string; projectId?: string | null; limit?: number }
): Promise<{ ok: true; hits: PageSearchHit[] } | { ok: false }> {
  // A paused writer flag does not restore the SQL search projection of rows
  // already converted during a mixed migration.
  const protectionActive = await shouldProtectPages();
  let protectedRows = false;
  if (!protectionActive) {
    let probe = client.from("pages").select("id").gt("encryption_version", 0)
      .is("deleted_at", null).limit(1);
    if (projectId) probe = probe.eq("project_id", projectId);
    const { data, error } = await probe;
    if (error && !["42703", "PGRST204"].includes(error.code)) {
      console.error("[pages] protected search probe failed:", error.message);
      return { ok: false };
    }
    protectedRows = !!data?.length;
  }
  if (protectedRows && !process.env.MINDDY_DATA_ROOT_KEY) {
    console.error("[pages] protected search key unavailable");
    return { ok: false };
  }
  if (protectedRows || protectionActive) {
    return searchProtectedPages(client, { query, projectId, limit });
  }
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

type SearchTerm = { words: string[]; excluded: boolean };
type SearchClause = SearchTerm[];

/** Match the websearch_to_tsquery operators against content decrypted in memory. */
export function parsePageSearchQuery(query: string): SearchClause[] {
  const clauses: SearchClause[] = [[]];
  let pendingExclusion = false;
  for (const token of query.slice(0, MAX_SEARCH_QUERY_LENGTH)
    .match(/-?"[^"]*"|\S+/g) ?? []) {
    if (token.toUpperCase() === "OR") {
      if (clauses.at(-1)?.length) clauses.push([]);
      continue;
    }
    if (token === "-") { pendingExclusion = true; continue; }
    const prefixed = token.startsWith("-");
    const excluded = pendingExclusion || prefixed;
    pendingExclusion = false;
    const words = (prefixed ? token.slice(1) : token).toLocaleLowerCase()
      .match(/[\p{L}\p{N}_]+/gu) ?? [];
    if (words.length) clauses.at(-1)?.push({ words, excluded });
  }
  return clauses.filter((clause) => clause.length);
}

function matchesPageSearch(text: string, clauses: SearchClause[]): boolean {
  const words = text.toLocaleLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
  return clauses.some((clause) => clause.every(({ words: term, excluded }) => {
    const found = words.some((_, index) =>
      term.every((word, offset) => words[index + offset] === word));
    return excluded ? !found : found;
  }));
}

/** Read every RLS-visible batch before ranking, so page limits never bias search. */
async function searchProtectedPages(client: SupabaseClient, {
  query, projectId, limit,
}: { query: string; projectId: string | null; limit: number }):
  Promise<{ ok: true; hits: PageSearchHit[] } | { ok: false }> {
  const clauses = parsePageSearchQuery(query);
  if (!clauses.length) return { ok: true, hits: [] };
  const terms = clauses.flatMap((clause) => clause.filter((term) => !term.excluded)
    .flatMap((term) => term.words));
  const hits: PageSearchHit[] = [];
  const batch = 200;
  for (let offset = 0; ; offset += batch) {
    let request = client.from("pages")
      .select("id,project_id,parent_id,title,icon,content,updated_at,encrypted_content,encryption_version")
      .is("deleted_at", null).order("id", { ascending: true })
      .range(offset, offset + batch - 1);
    if (projectId) request = request.eq("project_id", projectId);
    const { data, error } = await request;
    if (error) {
      console.error("[pages] protected search read failed:", error.message);
      return { ok: false };
    }
    for (const stored of data ?? []) {
      const row = await decodePageProjection(stored);
      const title = String(row.title ?? "");
      const body = await pageSearchText(row.content);
      const titleLower = title.toLocaleLowerCase();
      const bodyLower = body.toLocaleLowerCase();
      if (!matchesPageSearch(`${title} ${body}`, clauses)) continue;
      const titleScore = terms.reduce((n, term) => n +
        (titleLower.includes(term) ? 4 : 0), 0);
      const bodyScore = terms.reduce((n, term) => n +
        (bodyLower.includes(term) ? 1 : 0), 0);
      const first = Math.max(0, bodyLower.indexOf(terms.find((term) =>
        bodyLower.includes(term)) ?? terms[0] ?? "") - 35);
      hits.push({ id: row.id, project_id: row.project_id,
        parent_id: row.parent_id, title, icon: row.icon,
        updated_at: row.updated_at,
        excerpt: cleanExcerpt(body.slice(first, first + 180)),
        rank: titleScore + bodyScore });
    }
    if (!data || data.length < batch) break;
  }
  hits.sort((a, b) => b.rank - a.rank ||
    b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id));
  return { ok: true, hits: hits.slice(0,
    Math.min(Math.max(1, Math.trunc(limit) || 1), MAX_SEARCH_LIMIT)) };
}
