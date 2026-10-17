"use client";

import { useMemo } from "react";
import { semanticExtras } from "@/lib/issue-semantic-query";
import { useSemanticIssueSearch } from "@/lib/use-semantic-issue-search";

/**
 * Mention menus (MIN-718): the issue options found by meaning, appended after
 * the text matches of an `@` query.
 *
 * `all` is the menu's own option list (built from the search index under the
 * user's access); only its issue options can be appended, so a mention menu
 * never offers an issue it could not offer by typing its title. Appended rows
 * carry `semantic: true` for the "Related by meaning" divider, and come last,
 * so the highlighted row never moves when they arrive.
 */
export function useSemanticMentions<T extends { type: string; id: string }>(
  filtered: readonly T[],
  all: readonly T[],
  query: string,
  enabled = true,
): (T & { semantic?: boolean })[] {
  const { ids } = useSemanticIssueSearch(query, { projectId: null, enabled });
  return useMemo(() => {
    if (ids.length === 0) return [...filtered];
    const eligible = new Map(all.filter((option) => option.type === "issue").map((option) => [option.id, option]));
    const shown = new Set(filtered.filter((option) => option.type === "issue").map((option) => option.id));
    const extras = semanticExtras(ids, eligible, shown).map((option) => ({ ...option, semantic: true }));
    return [...filtered, ...extras];
  }, [ids, filtered, all]);
}
