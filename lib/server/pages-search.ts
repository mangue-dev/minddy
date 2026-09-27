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

type SearchTerm = { words: string[]; excluded: boolean; headline: boolean };
type SearchClause = SearchTerm[];

function pageLexemes(text: string): string[] {
  // The simple PostgreSQL parser keeps email addresses and file paths as one
  // lexeme, expands a URL into URL/host/path lexemes, and expands a hyphenated
  // word into whole/parts. A hyphen after a dotted host separates the words.
  const tokens = text.toLocaleLowerCase()
    .replace(/\b[\p{L}][\p{L}\p{N}+.-]*:\/\//gu, "").match(
    /[\p{L}\p{N}_]+(?:-[\p{L}\p{N}_]+)*@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+|[\p{L}\p{N}]+(?:\.[\p{L}\p{N}]+)+(?:\/[\p{L}\p{N}-]+)+|[\p{L}\p{N}]+(?:\/[\p{L}\p{N}-]+)+|\/[\p{L}\p{N}-]+(?:\/[\p{L}\p{N}-]+)*|[\p{L}\p{N}]+(?:\.[\p{L}\p{N}]+)+|[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)+|[\p{L}\p{N}]+/gu
  ) ?? [];
  return tokens.flatMap((token) => {
    if (token.includes("@")) return [token];
    if (token.includes(".") && token.includes("/")) {
      const slash = token.indexOf("/");
      return [token, token.slice(0, slash), token.slice(slash)];
    }
    if (token.includes("/")) return [token];
    return token.includes("-") ? [token, ...token.split("-")] : [token];
  });
}

/** Match the websearch_to_tsquery operators against content decrypted in memory. */
export function parsePageSearchQuery(query: string): SearchClause[] {
  const clauses: SearchClause[] = [[]];
  let pendingNegations = 0;
  for (const token of query.slice(0, MAX_SEARCH_QUERY_LENGTH)
    .match(/-*"[^"]*"|\S+/g) ?? []) {
    if (token.toUpperCase() === "OR" && clauses.at(-1)?.length) {
      clauses.push([]);
      continue;
    }
    if (/^-+$/.test(token)) { pendingNegations += token.length; continue; }
    const prefixed = token.match(/^-+/)?.[0].length ?? 0;
    const negations = pendingNegations + prefixed;
    const excluded = negations % 2 === 1;
    pendingNegations = 0;
    const raw = token.slice(prefixed);
    // websearch_to_tsquery reads a pasted URL as a scheme lexeme AND a single
    // slash-prefixed path lexeme; the document parser discards the protocol.
    const protocol = raw.match(/^([\p{L}][\p{L}\p{N}+.-]*):\/\/(.+)$/u);
    if (protocol) {
      for (const word of [protocol[1].toLocaleLowerCase(),
        `/${protocol[2].toLocaleLowerCase()}`]) {
        clauses.at(-1)?.push({ words: [word], excluded, headline: negations === 0 });
      }
      continue;
    }
    const words = pageLexemes(raw);
    if (!words.length) continue;
    if (raw.startsWith('"') || (words.length > 1 && !raw.includes(":"))) {
      clauses.at(-1)?.push({ words, excluded, headline: negations === 0 });
    } else {
      for (const word of words) clauses.at(-1)?.push({ words: [word], excluded,
        headline: negations === 0 });
    }
  }
  return clauses.filter((clause) => clause.length);
}

function matchesPageSearch(text: string, clauses: SearchClause[]): boolean {
  const words = pageLexemes(text);
  return clauses.some((clause) => clause.every(({ words: term, excluded }) => {
    const found = words.some((_, index) =>
      term.every((word, offset) => words[index + offset] === word));
    return excluded ? !found : found;
  }));
}

type PositionedWord = { word: string; position: number; weight: number };

function positionedWords(title: string, body: string): PositionedWord[] {
  const titleWords = pageLexemes(title);
  const bodyWords = pageLexemes(body);
  return [
    ...titleWords.map((word, index) => ({ word, position: index + 1, weight: 1 })),
    ...bodyWords.map((word, index) => ({ word, position: titleWords.length + index + 1, weight: 0.4 })),
  ];
}

function coversClause(words: PositionedWord[], clause: SearchClause): boolean {
  return clause.every((term) => {
    const found = words.some((word) => term.words.every((value, offset) =>
      words.some((candidate) => candidate.position === word.position + offset &&
        candidate.word === value)));
    return term.excluded ? !found : found;
  });
}

/** Cover density mirrors the old SQL rank's weighted, overlapping minimal covers. */
export function rankPageSearch(title: string, body: string, clauses: SearchClause[]): number | null {
  if (!matchesPageSearch(`${title} ${body}`, clauses)) return null;
  const positioned = positionedWords(title, body);
  // ts_rank_cd evaluates the entire tsquery at each prospective cover. Excluded
  // lexemes in the hit stream can block a later cover even when another clause
  // made the page match as a whole.
  const wanted = new Set(clauses.flatMap((clause) => clause.flatMap((term) => term.words)));
  const hits = positioned.filter((word) => wanted.has(word.word));
  if (!hits.length) return 0;
  const qualifies = (start: number, end: number) => clauses.some((clause) =>
    coversClause(hits.slice(start, end + 1), clause));
  let rank = 0;
  let start = 0;
  while (start < hits.length) {
    let end = start;
    while (end < hits.length && !qualifies(start, end)) end += 1;
    if (end === hits.length) break;
    let begin = end;
    while (begin > start && !qualifies(begin, end)) begin -= 1;
    const cover = hits.slice(begin, end + 1);
    const harmonicWeight = cover.length /
      cover.reduce((sum, word) => sum + 1 / word.weight, 0);
    const noise = Math.max(0, hits[end].position - hits[begin].position - (cover.length - 1));
    rank += harmonicWeight / (1 + noise);
    start = begin + 1;
  }
  return Math.fround(rank);
}

export function protectedPageExcerpt(body: string, clauses: SearchClause[]): string {
  const headlineClauses = clauses.map((clause) => clause.filter((term) => term.headline))
    .filter((clause) => clause.length);
  const terms = headlineClauses.flatMap((clause) => clause
    .flatMap((term) => term.words));
  const words = [...body.matchAll(/\S+/gu)];
  // ts_headline does not highlight a doubly negated conjunct. It returns the
  // initial MinWords fragment even though the positive match/rank is valid.
  if (clauses.length === 1 && clauses[0].some((term) => !term.headline && !term.excluded)) {
    const last = words[Math.min(words.length, 8) - 1];
    return cleanExcerpt(last ? body.slice(0, (last.index ?? 0) + last[0].length) : "");
  }
  const matching = words.map((match) => pageLexemes(match[0])
    .filter((word) => terms.includes(word)));
  const candidates = matching.flatMap((hits, index) => hits.length ? [index] : []);
  if (!candidates.length) {
    const last = words[Math.min(words.length, 8) - 1];
    return cleanExcerpt(last ? body.slice(0, (last.index ?? 0) + last[0].length) : "");
  }
  const renderMatched = (fragment: string) => cleanExcerpt(
    (fragment.trim().match(/^[\p{L}][\p{L}\p{N}+.-]*:\/\/\S+$/u)
      ? fragment.replace(/^[\p{L}][\p{L}\p{N}+.-]*:\/\//u, "")
      : fragment).replace(/[^\p{L}\p{N}_]+$/u, "")
  );
  if (words.length <= 22) return renderMatched(body);
  let start = 0;
  let foundCompleteClause = false;
  for (const candidate of candidates) {
    const windowStart = Math.min(Math.max(0, candidate - 10), words.length - 22);
    const windowText = words.slice(windowStart, windowStart + 22)
      .map((word) => word[0]).join(" ");
    const complete = headlineClauses.some((clause) =>
      matchesPageSearch(windowText, [clause]));
    if (complete && !foundCompleteClause) {
      start = windowStart;
      foundCompleteClause = true;
    }
  }
  const from = words[start].index ?? 0;
  const last = words[start + 21];
  const to = (last.index ?? 0) + last[0].length;
  return renderMatched(body.slice(from, to));
}

/** Read every RLS-visible batch before ranking, so page limits never bias search. */
async function searchProtectedPages(client: SupabaseClient, {
  query, projectId, limit,
}: { query: string; projectId: string | null; limit: number }):
  Promise<{ ok: true; hits: PageSearchHit[] } | { ok: false }> {
  const clauses = parsePageSearchQuery(query);
  if (!clauses.length) return { ok: true, hits: [] };
  const cap = Math.min(Math.max(1, Math.trunc(limit) || 1), MAX_SEARCH_LIMIT);
  const ranked: Array<PageSearchHit & { body: string }> = [];
  const compare = (a: PageSearchHit, b: PageSearchHit) => b.rank - a.rank ||
    b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id);
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
      const rank = rankPageSearch(title, body, clauses);
      if (rank === null) continue;
      ranked.push({ id: row.id, project_id: row.project_id,
        parent_id: row.parent_id, title, icon: row.icon,
        updated_at: row.updated_at,
        excerpt: "", rank, body });
      ranked.sort(compare);
      if (ranked.length > cap) ranked.pop();
    }
    if (!data || data.length < batch) break;
  }
  return { ok: true, hits: ranked.map(({ body, ...hit }) => ({
    ...hit, excerpt: protectedPageExcerpt(body, clauses),
  })) };
}
