/**
 * Which typed queries go to semantic issue search (MIN-718) — pure and shared
 * by the pickers and the server, so both sides refuse the same input.
 *
 * Lexical lookup always answers first and stays authoritative. Semantic search
 * only complements it, and only for queries that read like a description:
 *
 * - at least two words, or one word of at least six letters. One or two
 *   short words are prefix lookups; meaning adds noise there, and every query
 *   costs an embedding call;
 * - never identifier-like input (`MIN-42`, `#42`, `42`, `min-`): an exact
 *   identifier is answered by lexical lookup and must never be displaced;
 * - at most 300 characters (a pasted paragraph is cut, not refused).
 */

export const SEMANTIC_QUERY_MAX_CHARS = 300;
/** Semantic hits a picker appends after its lexical results. */
export const SEMANTIC_PICKER_HITS = 5;

const IDENTIFIER_LIKE = /^(?:#?\d+|[a-z]{1,10}-\d*|[a-z]{2,10}\s*\d+)$/i;

/** The query normalized for caching: trimmed, lowercased, single spaces, bounded. */
export function normalizeSemanticQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLocaleLowerCase().slice(0, SEMANTIC_QUERY_MAX_CHARS);
}

export function isSemanticQuery(query: string): boolean {
  const normalized = normalizeSemanticQuery(query);
  if (!normalized || IDENTIFIER_LIKE.test(normalized)) return false;
  const words = normalized.split(" ").filter((word) => /\p{L}/u.test(word));
  if (words.length >= 2) return normalized.replace(/[^\p{L}\p{N}]/gu, "").length >= 6;
  return words.length === 1 && words[0].replace(/[^\p{L}]/gu, "").length >= 6;
}

/**
 * Semantic hits to append after a picker's lexical results: in semantic
 * order, only issues the picker already considers eligible (its own candidate
 * list carries every permission, status and exclusion rule), never one the
 * lexical list already shows, at most `max`. Pure.
 */
export function semanticExtras<T>(
  ids: readonly string[],
  eligible: ReadonlyMap<string, T>,
  shownIds: ReadonlySet<string>,
  max = SEMANTIC_PICKER_HITS,
): T[] {
  const extras: T[] = [];
  for (const id of ids) {
    if (shownIds.has(id)) continue;
    const item = eligible.get(id);
    if (item === undefined) continue;
    extras.push(item);
    if (extras.length >= max) break;
  }
  return extras;
}
