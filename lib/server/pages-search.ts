import "server-only";
import { createHash } from "node:crypto";

import type { JSONContent } from "@tiptap/core";
import type { SupabaseClient } from "@supabase/supabase-js";

import { afterOrNow } from "@/lib/server/after-safe";
import { getServiceClient } from "@/lib/supabase-service";
import { pageBodyToMarkdownServer } from "@/lib/server/pages-projection";
import type { PageSearchHit } from "@/lib/types";
import { decodePageProjection, shouldProtectPages } from "./page-content";
import { PageSearchProjectionCache } from "./pages-search-projection-cache";

const projectionCache = new PageSearchProjectionCache();

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

/* ─── Reads ──────────────────────────────────────────────────────────────── */

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

const PAGE_WORD_PATTERN = /[\p{L}\p{N}_]+(?:-[\p{L}\p{N}_]+)*@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+|[\p{L}\p{N}]+(?:\.[\p{L}\p{N}]+)+(?:\/[\p{L}\p{N}-]+)+|[\p{L}\p{N}]+(?:\/[\p{L}\p{N}-]+)+|\/[\p{L}\p{N}-]+(?:\/[\p{L}\p{N}-]+)*|[\p{L}\p{N}]+(?:\.[\p{L}\p{N}]+)+|[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)+|[\p{L}\p{N}]+/gu;

function pageLexemes(text: string): string[] {
  // The simple PostgreSQL parser keeps email addresses and file paths as one
  // lexeme, expands a URL into URL/host/path lexemes, and expands a hyphenated
  // word into whole/parts. A hyphen after a dotted host separates the words.
  const tokens = text.toLocaleLowerCase().replace(/<[^>]*>/g, " ")
    .replace(/\b[\p{L}][\p{L}\p{N}+.-]*:\/\//gu, "")
    .match(PAGE_WORD_PATTERN) ?? [];
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

/** Prefix counts test repeated cover windows without rescanning their word arrays. */
function coverMatcher(words: Array<{ word: string; position: number }>, clauses: SearchClause[]) {
  const indexed = clauses.map((clause) => clause.map((term) => {
    const ends = new Int32Array(words.length + 1);
    for (let end = 0; end < words.length; end++) {
      const start = end - term.words.length + 1;
      const found = start >= 0 && term.words.every((value, offset) =>
        words[start + offset].word === value &&
        words[start + offset].position === words[start].position + offset);
      ends[end + 1] = ends[end] + Number(found);
    }
    return { ends, length: term.words.length, excluded: term.excluded };
  }));
  return (start: number, end: number) => indexed.some((clause) => clause.every((term) => {
    const found = term.ends[end + 1] > term.ends[Math.min(end + 1, start + term.length - 1)];
    return term.excluded ? !found : found;
  }));
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
  const qualifies = coverMatcher(hits, clauses);
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

type HeadlineWord = { value: string; start: number; end: number; counted: boolean };

/** Match PostgreSQL's counted headline words, including hyphen parts and URL components. */
function headlineWords(body: string): HeadlineWord[] {
  const protocols = [...body.matchAll(/\b[\p{L}][\p{L}\p{N}+.-]*:\/\//gu)];
  const tokenBody = body.replace(/\b[\p{L}][\p{L}\p{N}+.-]*:\/\//gu, (match) => " ".repeat(match.length));
  const words = [...tokenBody.matchAll(PAGE_WORD_PATTERN)].flatMap((match) => {
    const value = match[0].toLocaleLowerCase();
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (value.includes("@")) return [{ value, start, end, counted: true }];
    if (value.includes(".") && value.includes("/")) {
      const slash = value.indexOf("/");
      return [{ value, start, end, counted: false },
        { value: value.slice(0, slash), start, end: start + slash, counted: true },
        { value: value.slice(slash), start: start + slash, end, counted: true }];
    }
    if (value.includes("-") && !value.includes("/")) {
      let offset = start;
      return [{ value, start, end, counted: false }, ...value.split("-").map((part) => {
        const word = { value: part, start: offset, end: offset + part.length, counted: true };
        offset = word.end + 1;
        return word;
      })];
    }
    return [{ value, start, end, counted: true }];
  });
  for (const protocol of protocols) words.push({ value: "", start: protocol.index ?? 0,
    end: (protocol.index ?? 0) + protocol[0].length, counted: true });
  return words.sort((left, right) => left.start - right.start);
}

export function protectedPageExcerpt(body: string, clauses: SearchClause[]): string {
  // The SQL headline replaces XML tags before rendering a fragment. Keeping
  // attributes in the token stream also distorts proximity and word budgets.
  body = body.replace(/<[^>]*>/g, " ");
  const words = headlineWords(body);
  if (!words.length) return "";
  const positive = clauses.map((clause) => clause.filter((term) => term.headline && !term.excluded))
    .filter((clause) => clause.length);
  const ignoreHighlights = clauses.length === 1 && clauses[0].some((term) => !term.headline && !term.excluded);
  const wanted = new Set(ignoreHighlights ? [] : positive.flatMap((clause) => clause.flatMap((term) => term.words)));
  const interesting = (index: number) => wanted.has(words[index].value);
  const candidates = words.flatMap((_, index) => interesting(index) ? [index] : []);
  const satisfies = coverMatcher(words.map((word, position) => ({ word: word.value, position })), positive);
  let best: { from: number; to: number; count: number; matches: number } | null = null;
  // PostgreSQL selects a minimal cover, prefers more query words, and then
  // stretches it symmetrically. Whitespace tokens and compound parents do not
  // consume its MaxWords budget. Short or numeric endpoints are trimmed.
  for (let cursor = 0; cursor < candidates.length;) {
    let end = cursor;
    while (end < candidates.length && !satisfies(candidates[cursor], candidates[end])) end++;
    if (end === candidates.length) break;
    let begin = end;
    while (begin > cursor && !satisfies(candidates[begin], candidates[end])) begin--;
    let from = candidates[begin];
    let to = candidates[end];
    let count = 0;
    let matches = 0;
    let lastMatch = from;
    for (let index = from; index <= to && count < 22; index++) {
      if (words[index].counted) count++;
      if (interesting(index)) { matches++; lastMatch = index; }
    }
    to = lastMatch;
    count = words.slice(from, to + 1).filter((word) => word.counted).length;
    if (!best || matches > best.matches || (matches === best.matches && count < best.count)) {
      best = { from, to, count, matches };
    }
    cursor = begin + 1;
  }
  if (!best) {
    let count = 0;
    let last = 0;
    while (last < words.length && count < 8) { if (words[last].counted) count++; last++; }
    return cleanExcerpt(last === words.length ? body : body.slice(0, words[last - 1].end));
  }
  let { from, to, count } = best;
  const badEndpoint = (index: number) => !interesting(index) &&
    (!words[index].counted || Buffer.byteLength(words[index].value, "utf8") <= 2 || /^[\d.]+$/.test(words[index].value) ||
      body.slice(words[index].end, words[index].end + 3) === "://");
  const leftBudget = Math.floor((22 - count) / 2);
  let leftCount = 0;
  while (from > 0 && leftCount < leftBudget) {
    from--;
    if (words[from].counted) { leftCount++; count++; }
  }
  while (from < best.from && badEndpoint(from)) { if (words[from].counted) count--; from++; }
  while (to + 1 < words.length && count < 22) { to++; if (words[to].counted) count++; }
  while (to > best.to && badEndpoint(to)) to--;
  return cleanExcerpt(body.slice(words[from].start, words[to].end));
}

/** Read every RLS-visible batch before ranking, so page limits never bias search. */
async function searchProtectedPages(client: SupabaseClient, {
  query, projectId, limit,
}: { query: string; projectId: string | null; limit: number }):
  Promise<{ ok: true; hits: PageSearchHit[] } | { ok: false }> {
  const clauses = parsePageSearchQuery(query);
  if (!clauses.length) return { ok: true, hits: [] };
  const cap = Math.min(Math.max(1, Math.trunc(limit) || 1), MAX_SEARCH_LIMIT);
  const ranked: Array<PageSearchHit & { body: string; cacheIdentity: string | null }> = [];
  const queryIdentity = createHash("sha256").update(JSON.stringify(clauses)).digest("hex");
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
      // RLS and authenticated decryption run on every request, including cache hits.
      // Exact ciphertext plus row ownership prevents reuse after edits or scope changes.
      const cacheIdentity = typeof stored.encrypted_content === "string" && stored.encryption_version > 0
        ? createHash("sha256")
          .update(JSON.stringify([stored.project_id, stored.id, stored.encryption_version]))
          .update(stored.encrypted_content).digest("hex") : null;
      const body = cacheIdentity
        ? await projectionCache.get(cacheIdentity, () => pageSearchText(row.content))
        : await pageSearchText(row.content);
      const rank: number | null = cacheIdentity
        ? JSON.parse(await projectionCache.get(`${cacheIdentity}:${queryIdentity}:rank`,
          async () => JSON.stringify(rankPageSearch(title, body, clauses))))
        : rankPageSearch(title, body, clauses);
      if (rank === null) continue;
      ranked.push({ id: row.id, project_id: row.project_id,
        parent_id: row.parent_id, title, icon: row.icon,
        updated_at: row.updated_at,
        excerpt: "", rank, body, cacheIdentity });
      ranked.sort(compare);
      if (ranked.length > cap) ranked.pop();
    }
    if (!data || data.length < batch) break;
  }
  const hits = await Promise.all(ranked.map(async ({ body, cacheIdentity, ...hit }) => ({
    ...hit, excerpt: cacheIdentity
      ? await projectionCache.get(`${cacheIdentity}:${queryIdentity}:excerpt`,
        async () => protectedPageExcerpt(body, clauses))
      : protectedPageExcerpt(body, clauses),
  })));
  return { ok: true, hits };
}
