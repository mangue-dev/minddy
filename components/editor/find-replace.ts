// Find and replace in a document: pages and the task notebook only. The bar
// (find-bar.tsx) holds the query; this module holds what the query does to a
// document, on plain ProseMirror states, so it is testable without a view.
//
// Matching and highlighting come from `prosemirror-search`: its plugin stores
// the query and decorates every match (`ProseMirror-search-match`) and the one
// the selection covers (`ProseMirror-active-search-match`); app/globals.css
// colors both. Navigation and replacement are written here rather than taken
// from its commands, for three reasons:
// - the bar shows “n of m”, so the matches have to be listed anyway;
// - empty regular-expression matches (`^`, `a*`) are skipped everywhere,
//   so the count, the arrows and Replace all agree with what is highlighted;
// - the document is replaced by ordinary transactions, one per gesture, so
//   history, autosave and the live session see a normal edit.

import { Extension } from "@tiptap/core";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import { SearchQuery, search, type SearchResult } from "prosemirror-search";

export { getSearchState, setSearchState } from "prosemirror-search";
export type { SearchResult };

/** Mounted only by the surfaces that offer the bar (pages, the notebook). */
export const FindReplace = Extension.create({
  name: "findReplace",
  addProseMirrorPlugins() {
    return [search()];
  },
});

export interface FindOptions {
  search: string;
  replace: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regexp: boolean;
}

/**
 * The library query for what the bar holds.
 *
 * `literal`: the library otherwise reads `\n` and `\t` in the text as line
 * breaks and tabs, which a text block cannot hold anyway. In regular
 * expression mode the replacement reads `$&` as the match and `$1` to `$9`
 * as its groups; a plain search replaces with the exact text typed (see
 * `applyReplacements`).
 */
export function findQuery(options: FindOptions): SearchQuery {
  return new SearchQuery({
    search: options.search,
    replace: options.replace,
    caseSensitive: options.caseSensitive,
    wholeWord: options.wholeWord,
    regexp: options.regexp,
    literal: true,
  });
}

/** A regular expression the browser refuses: the bar says so and highlights nothing. */
export function isInvalidPattern(options: Pick<FindOptions, "search" | "regexp">): boolean {
  return options.regexp && options.search !== "" && !findQuery({
    ...options,
    replace: "",
    caseSensitive: false,
    wholeWord: false,
  }).valid;
}

/** Escape a selection seeded into a regular-expression search. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every non-empty match, in document order. */
export function findMatches(state: EditorState, query: SearchQuery): SearchResult[] {
  if (!query.valid) return [];
  const matches: SearchResult[] = [];
  const end = state.doc.content.size;
  for (let pos = 0; pos < end;) {
    const next = query.findNext(state, pos, end);
    if (!next) break;
    if (next.to > next.from) matches.push(next);
    pos = Math.max(next.to, pos + 1);
  }
  return matches;
}

/** The match the selection covers exactly, or -1. */
export function currentMatchIndex(state: EditorState, matches: readonly SearchResult[]): number {
  const { from, to } = state.selection;
  return matches.findIndex((match) => match.from === from && match.to === to);
}

/** The first match starting at or after `pos`, wrapping to the first one. */
export function matchFrom(matches: readonly SearchResult[], pos: number): SearchResult | null {
  if (matches.length === 0) return null;
  return matches.find((match) => match.from >= pos) ?? matches[0];
}

/** The match after (`1`) or before (`-1`) the selection, wrapping around. */
export function stepMatch(
  state: EditorState,
  matches: readonly SearchResult[],
  direction: 1 | -1,
): SearchResult | null {
  if (matches.length === 0) return null;
  const { from, to } = state.selection;
  if (direction === 1) return matches.find((match) => match.from >= to) ?? matches[0];
  for (let index = matches.length - 1; index >= 0; index--) {
    if (matches[index].to <= from) return matches[index];
  }
  return matches[matches.length - 1];
}

/** Select a match; the bar reveals it once the view has drawn it. */
export function selectMatch(state: EditorState, match: SearchResult): Transaction {
  return state.tr.setSelection(TextSelection.create(state.doc, match.from, match.to));
}

function applyReplacements(tr: Transaction, state: EditorState, query: SearchQuery, match: SearchResult) {
  // The library reads `$` placeholders in every mode (and drops a leading
  // `$$`), so a plain replacement is inserted here, as typed, with the marks
  // the matched text carried.
  if (!query.regexp) {
    const marks = state.doc.resolve(match.from).marksAcross(state.doc.resolve(match.to)) ?? undefined;
    if (query.replace) tr.replaceWith(match.from, match.to, state.schema.text(query.replace, marks));
    else tr.delete(match.from, match.to);
    return;
  }
  const replacements = query.getReplacements(state, match);
  // Back to front, like every caller: the earlier positions of `state.doc`
  // are untouched by a later replacement, so they need no mapping.
  for (let index = replacements.length - 1; index >= 0; index--) {
    const { from, to, insert } = replacements[index];
    tr.replace(from, to, insert);
  }
}

/**
 * Replace the match the selection covers and select the next one. Without a
 * selected match, select the next match instead, so the first Replace shows
 * what the second will change. Null when there is nothing to do.
 */
export function replaceCurrentMatch(state: EditorState, query: SearchQuery): Transaction | null {
  const matches = findMatches(state, query);
  const index = currentMatchIndex(state, matches);
  if (index === -1) {
    const next = matchFrom(matches, state.selection.from);
    return next ? selectMatch(state, next) : null;
  }
  const match = matches[index];
  const tr = state.tr;
  applyReplacements(tr, state, query, match);
  const end = tr.mapping.map(match.to);
  // The next match, read on the replaced document: a replacement can create
  // or remove matches around it.
  const after = EditorState.create({ doc: tr.doc });
  const next = matchFrom(findMatches(after, query), end);
  tr.setSelection(next
    ? TextSelection.create(tr.doc, next.from, next.to)
    : TextSelection.create(tr.doc, end));
  return tr;
}

/** Replace every match in one transaction (one undo step). */
export function replaceAllMatches(
  state: EditorState,
  query: SearchQuery,
): { tr: Transaction; count: number } | null {
  const matches = findMatches(state, query);
  if (matches.length === 0) return null;
  const tr = state.tr;
  for (let index = matches.length - 1; index >= 0; index--) {
    applyReplacements(tr, state, query, matches[index]);
  }
  return { tr, count: matches.length };
}
