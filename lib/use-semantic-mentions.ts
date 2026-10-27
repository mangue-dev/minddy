"use client";

import { useMemo } from "react";
import { semanticExtras } from "@/lib/issue-semantic-query";
import { orderIssuesForSearch } from "@/lib/issue-search-order";
import { useSemanticIssueSearch } from "@/lib/use-semantic-issue-search";
import type { SemanticSearchStatus } from "@/components/semantic-searching-hint";

/**
 * Mention menus (MIN-718): the issue options found by meaning, appended after
 * the text matches of an `@` query.
 *
 * `all` is the menu's own option list (built from the search index under the
 * user's access); only its issue options can be appended, so a mention menu
 * never offers an issue it could not offer by typing its title. Appended rows
 * carry `semantic: true` for the "Related by meaning" divider, and come last,
 * so the highlighted row never moves when they arrive. A query whose text
 * already matches a non-issue option (a person, a project, a page) is not
 * sent at all. `status` feeds the menu's status row: the answer is still in
 * flight, or it came back with no issue to append.
 */
export function useSemanticMentions<T extends { type: string; id: string }>(
  filtered: readonly T[],
  all: readonly T[],
  query: string,
  enabled = true,
): { options: (T & { semantic?: boolean })[]; status: SemanticSearchStatus | null } {
  // A query that already names a person, a project or a page by its text is
  // not a description of work: `@Marie Dupont` must not cost an embedding.
  const namesSomethingElse = filtered.some((option) => option.type !== "issue");
  const { ids, pending, answered } = useSemanticIssueSearch(query, { projectId: null, enabled: enabled && !namesSomethingElse });
  const options = useMemo(() => {
    if (ids.length === 0) return [...filtered];
    const eligible = new Map(all.filter((option) => option.type === "issue").map((option) => [option.id, option]));
    const shown = new Set(filtered.filter((option) => option.type === "issue").map((option) => option.id));
    // Same order as the text rows (MIN-726), by similarity within a tier.
    const extras = orderIssuesForSearch(
      semanticExtras(ids, eligible, shown),
      (option) => (option as { status?: string }).status,
    ).map((option) => ({ ...option, semantic: true }));
    return [...filtered, ...extras];
  }, [ids, filtered, all]);
  const appended = options.length > filtered.length;
  const status = pending ? "searching" : answered && !appended ? "none" : null;
  return { options, status };
}
