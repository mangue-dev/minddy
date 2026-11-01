"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { filterFacet, filterToggle } from "@/components/filter-menu";
import type { ContextMenuAction } from "@/components/issue-context-menu";
import { ObjectivePill } from "@/components/objective-label";
import type { FeedbackPropertyFilters } from "@/lib/collection-filters";
import type { Category, Objective } from "@/lib/types";
import type { TeamFeedbackListItem } from "@/lib/server/feedback/team-queries";

type FeedbackAuthorOption = { id: string; name: string | null; email: string | null; pseudonym: string };

/** The property facets of the feedback filter menu. Authors come from the
    server search the menu's query drives, plus every author already seen, so
    a selected author stays listed while another name is searched. */
export function useFeedbackPropertyFilterActions({ filters, onChange, objectives, categories, posts, authors: availableAuthors, boardEnabled }: {
  filters: FeedbackPropertyFilters; onChange: (filters: FeedbackPropertyFilters) => void;
  objectives: Objective[]; categories: Category[]; posts: TeamFeedbackListItem[];
  authors: FeedbackAuthorOption[]; boardEnabled: boolean;
}): ContextMenuAction[] {
  const t = useTranslations("FeedbackBoard");
  const tf = useTranslations("Field");
  const tc = useTranslations("Common");
  const [authors, setAuthors] = useState(new Map<string, FeedbackAuthorOption>());
  useEffect(() => {
    setAuthors((previous) => new Map([...previous, ...availableAuthors.map((a) => [a.id, a] as const),
      ...posts.filter((p) => p.author).map((p) => [p.author!.id, p.author!] as const)]));
  }, [posts, availableAuthors]);
  const facets: { key: keyof FeedbackPropertyFilters; label: string; options: { value: string | null; label: string; node?: ReactNode; keywords?: string[] }[] }[] = [
    { key: "objective", label: tf("objective"), options: [{ value: null, label: tf("noObjective") }, ...objectives.map((o) => ({ value: o.id, label: o.name, node: <ObjectivePill objective={o} /> }))] },
    { key: "category", label: tf("categories"), options: categories.map((c) => ({ value: c.id, label: c.name })) },
    { key: "author", label: t("author"), options: [{ value: null, label: tc("none") }, ...Array.from(authors.values()).map((a) => ({
      value: a.id, label: a.name || a.email || a.pseudonym,
      keywords: [a.email, a.pseudonym].filter((value): value is string => !!value),
    }))] },
    { key: "source", label: t("filterSource"), options: (["board", "api", "internal"] as const).map((value) => ({ value, label: t(`filterSource_${value}`) })) },
    { key: "review", label: t("filterReview"), options: [{ value: "pending", label: t("reviewPending") }, { value: "published", label: t("filterReview_published") }] },
    ...(boardEnabled ? [{ key: "visibility" as const, label: t("visibility"), options: [{ value: "public", label: t("public") }, { value: "private", label: t("private") }] }] : []),
  ];
  return facets.filter((f) => f.options.length).map(({ key, label, options }) => filterFacet({
    id: key, label, count: filters[key]?.length ?? 0,
    children: options.map((option) => {
      const selected = filters[key] ?? [];
      const active = (selected as (string | null)[]).includes(option.value);
      return filterToggle({
        id: option.value ?? "none", label: option.label, labelNode: option.node, keywords: option.keywords, active,
        onToggle: () => onChange({ ...filters, [key]: active ? selected.filter((id) => id !== option.value) : [...selected, option.value] }),
      });
    }),
  }));
}
