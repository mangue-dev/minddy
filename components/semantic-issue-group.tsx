"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { defaultFilter, useCommandState } from "cmdk";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { semanticExtras } from "@/lib/issue-semantic-query";
import { orderIssuesForSearch } from "@/lib/issue-search-order";
import { useSemanticIssueSearch } from "@/lib/use-semantic-issue-search";

/**
 * "Related by meaning" — the semantic half of an issue picker built on cmdk
 * (MIN-718). Rendered inside the picker's `Command`, after its own groups.
 *
 * It reads the typed query from cmdk itself, asks for issue ids ranked by
 * meaning, keeps only the picker's OWN eligible candidates (so every
 * permission, status and exclusion rule of that picker applies), drops those
 * cmdk already shows lexically — scored with cmdk's own `defaultFilter` on
 * the same value and keywords as the picker's text row — and appends at most
 * five rows. The rows are
 * `forceMount`ed with a `semantic:` value — cmdk would otherwise hide them,
 * since their text may share no word with the query — and they land in the
 * last group, so the highlighted row never jumps when they arrive.
 */
export function SemanticIssueGroup<T>({
  projectId,
  candidates,
  idOf,
  textOf,
  statusOf,
  renderItem,
  onSelect,
}: {
  /** Scope of the search; `null` = every readable project. */
  projectId: string | null;
  /** The picker's eligible issues, already filtered by its own rules. */
  candidates: readonly T[];
  idOf: (item: T) => string;
  /** The cmdk `value` and `keywords` of the same issue's text row in this picker. */
  textOf: (item: T) => { value: string; keywords?: string[] };
  /** The issue's status: the rows follow the search order of MIN-726 (under way first, closed last). */
  statusOf?: (item: T) => string | null | undefined;
  renderItem: (item: T) => React.ReactNode;
  onSelect: (item: T) => void;
}) {
  const t = useTranslations("Picker");
  const search = useCommandState((state) => state.search);
  // No eligible issue, nothing to show: no query embedding is paid for.
  const { ids } = useSemanticIssueSearch(search, { projectId, enabled: candidates.length > 0 });

  const extras = React.useMemo(() => {
    if (ids.length === 0) return [];
    const eligible = new Map(candidates.map((item) => [idOf(item), item]));
    const shown = new Set<string>();
    if (search.trim()) {
      for (const id of ids) {
        const item = eligible.get(id);
        if (!item) continue;
        const { value, keywords } = textOf(item);
        if (defaultFilter(value, search, keywords) > 0) shown.add(id);
      }
    }
    const extras = semanticExtras(ids, eligible, shown);
    // Same order as the text rows: work under way first, closed last, by
    // similarity within a tier.
    return statusOf ? orderIssuesForSearch(extras, statusOf) : extras;
  }, [ids, candidates, idOf, textOf, statusOf, search]);

  if (extras.length === 0) return null;
  return (
    <CommandGroup heading={t("relatedByMeaning")} forceMount data-semantic-group="">
      {extras.map((item) => (
        <CommandItem
          key={idOf(item)}
          value={`semantic:${idOf(item)}`}
          forceMount
          onSelect={() => onSelect(item)}
        >
          {renderItem(item)}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
