// Search across an action menu's whole tree (MIN-845). A searchable menu used
// to filter its top-level entries only, so an entry living in a submenu
// (Relations › Blocked by) could not be found by typing. The search below
// walks every level and keeps each entry's path, so the menu can list a
// nested match as one selectable row that shows where it lives.

export interface SearchableAction<T> {
  label: string;
  /** Additional search terms (synonyms, the other language, etc.). */
  keywords?: string[];
  disabled?: boolean;
  children?: T[];
}

export interface ActionSearchMatch<T> {
  action: T;
  /** Labels of the branches leading to the entry, outermost first; empty at the top level. */
  path: string[];
  /** The entry or one of its branches is disabled. */
  disabled: boolean;
}

/**
 * The entry matches if a word of its label or keywords starts with the query
 * ("blocked" finds "Mark as blocked by…", "heading 1" finds "Heading 1").
 * Matching inside a word made "red" find every list through "unordered" once
 * the search reached the block types' keywords.
 */
export function actionMatchesQuery(action: SearchableAction<unknown>, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [action.label, ...(action.keywords ?? [])].join(" ").toLowerCase();
  for (let at = haystack.indexOf(q); at !== -1; at = haystack.indexOf(q, at + 1)) {
    if (at === 0 || !/[\p{L}\p{N}]/u.test(haystack[at - 1])) return true;
  }
  return false;
}

/**
 * Every entry matching `query`, at any depth, in menu order: a branch comes
 * before its own matching entries. A matching branch is returned as itself
 * (it keeps its submenu); a nested entry is returned only when it matches on
 * its own label or keywords, so typing a branch's name does not unfold every
 * entry under it unless they share the term. A nested branch is never
 * returned itself: a flat result row has no submenu to open, so only its
 * matching entries are. An empty query returns the top level unchanged.
 */
export function searchActionTree<T extends SearchableAction<T>>(
  actions: readonly T[],
  query: string,
): ActionSearchMatch<T>[] {
  const q = query.trim().toLowerCase();
  if (!q) return actions.map((action) => ({ action, path: [], disabled: !!action.disabled }));
  const matches: ActionSearchMatch<T>[] = [];
  const walk = (items: readonly T[], path: string[], disabled: boolean) => {
    for (const action of items) {
      const off = disabled || !!action.disabled;
      const nestedBranch = path.length > 0 && !!action.children?.length;
      if (!nestedBranch && actionMatchesQuery(action, q)) matches.push({ action, path, disabled: off });
      if (action.children?.length) walk(action.children, [...path, action.label], off);
    }
  };
  walk(actions, [], false);
  return matches;
}
