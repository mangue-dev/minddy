"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CommandGroup, CommandItem } from "mangue-ui";
import { checkedProps } from "@/components/search-select";
import type { FeedbackPropertyFilters } from "@/lib/collection-filters";
import type { Category, Objective } from "@/lib/types";
import type { TeamFeedbackListItem } from "@/lib/server/feedback/team-queries";

export function FeedbackPropertyFilterItems({ filters, onChange, objectives, categories, posts, authors: availableAuthors, boardEnabled }: {
  filters: FeedbackPropertyFilters; onChange: (filters: FeedbackPropertyFilters) => void;
  objectives: Objective[]; categories: Category[]; posts: TeamFeedbackListItem[];
  authors: { id: string; name: string | null; email: string | null; pseudonym: string }[]; boardEnabled: boolean;
}) {
  const t = useTranslations("FeedbackBoard");
  const tf = useTranslations("Field");
  const tc = useTranslations("Common");
  const [authors, setAuthors] = useState(new Map<string, (typeof availableAuthors)[number]>());
  useEffect(() => {
    setAuthors((previous) => new Map([...previous, ...availableAuthors.map((a) => [a.id, a] as const),
      ...posts.filter((p) => p.author).map((p) => [p.author!.id, p.author!] as const)]));
  }, [posts, availableAuthors]);
  const facets: { key: keyof FeedbackPropertyFilters; label: string; options: { value: string | null; label: string }[] }[] = [
    { key: "objective", label: tf("objective"), options: [{ value: null, label: tf("noObjective") }, ...objectives.map((o) => ({ value: o.id, label: o.name }))] },
    { key: "category", label: tf("categories"), options: categories.map((c) => ({ value: c.id, label: c.name })) },
    { key: "author", label: t("author"), options: [{ value: null, label: tc("none") }, ...Array.from(authors.values()).map((a) => ({ value: a.id, label: a.name || a.email || a.pseudonym }))] },
    { key: "source", label: t("filterSource"), options: (["board", "api", "internal"] as const).map((value) => ({ value, label: t(`filterSource_${value}`) })) },
    { key: "review", label: t("filterReview"), options: [{ value: "pending", label: t("reviewPending") }, { value: "published", label: t("filterReview_published") }] },
    ...(boardEnabled ? [{ key: "visibility" as const, label: t("visibility"), options: [{ value: "public", label: t("public") }, { value: "private", label: t("private") }] }] : []),
  ];
  return <>{facets.filter((f) => f.options.length).map(({ key, label, options }) => <CommandGroup key={key} heading={label}>
    {options.map((option) => {
      const selected = filters[key] ?? [];
      const active = (selected as (string | null)[]).includes(option.value);
      return <CommandItem key={option.value ?? "none"} value={`property-${key}-${option.value ?? "none"}`} keywords={[label, option.label]}
        {...checkedProps(active)} onSelect={() => onChange({ ...filters,
          [key]: active ? selected.filter((id) => id !== option.value) : [...selected, option.value],
        })}>{option.label}</CommandItem>;
    })}
  </CommandGroup>)}</>;
}
