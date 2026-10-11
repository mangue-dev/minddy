"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, CommandGroup, CommandItem, CommandSeparator } from "mangue-ui";
import { HugeiconsIcon } from "@hugeicons/react";
import { FilterIcon } from "@hugeicons/core-free-icons";
import { SearchMenu } from "@/components/search-menu";
import { checkedProps } from "@/components/search-select";
import { EFFORTS, PRIORITIES } from "@/lib/issue-constants";
import { ME_ASSIGNEE } from "@/lib/view-filter";
import { displayName } from "@/lib/display-name";
import type { Category, Member, Objective, ViewFilters } from "@/lib/types";

export type CollectionFilterProps = {
  filters: ViewFilters; onChange: (filters: ViewFilters) => void;
  members: Member[]; categories: Category[]; objectives: Objective[];
  integrations?: { id: string; name: string }[];
};

export function CollectionFilterItems({ filters, onChange, members, categories, objectives, integrations }: CollectionFilterProps) {
  const tf = useTranslations("Field");
  const tc = useTranslations("Common");
  const tp = useTranslations("Priority");
  const tActivity = useTranslations("Activity");
  const facets: { key: "priority" | "effort" | "assignee" | "objective" | "category" | "integration"; label: string; options: { value: string | null; label: string }[] }[] = [
    { key: "priority", label: tf("priority"), options: PRIORITIES.map((p) => ({ value: p.value, label: tp(p.value) })) },
    { key: "effort", label: tf("effort"), options: EFFORTS.map((e) => ({ value: e.value, label: e.label })) },
    { key: "assignee", label: tf("assignee"), options: [{ value: ME_ASSIGNEE, label: tf("assignedToMe") }, { value: null, label: tf("unassigned") }, ...members.map((m) => ({ value: m.user_id, label: displayName(m, tActivity("memberSomeone")) }))] },
    { key: "objective", label: tf("objective"), options: [{ value: null, label: tc("none") }, ...objectives.map((o) => ({ value: o.id, label: o.name }))] },
    { key: "category", label: tf("categories"), options: categories.map((c) => ({ value: c.id, label: c.name })) },
    ...(integrations ? [{ key: "integration" as const, label: tf("integration"), options: [{ value: null, label: tc("none") }, ...integrations.map((i) => ({ value: i.id, label: i.name }))] }] : []),
  ];
  return <>
    {facets.filter((facet) => facet.options.length).map(({ key, label, options }) => <CommandGroup key={key} heading={label}>
      {options.map((option) => {
        const active = (filters[key] as (string | null)[] | undefined)?.includes(option.value) ?? false;
        return <CommandItem key={option.value ?? "none"} value={`property-${key}-${option.value ?? "none"}`} keywords={[label, option.label]}
          {...checkedProps(active)} onSelect={() => {
            const selected = filters[key] as (string | null)[] | undefined ?? [];
            onChange({ ...filters, [key]: active ? selected.filter((value) => value !== option.value) : [...selected, option.value] });
          }}>{option.label}</CommandItem>;
      })}
    </CommandGroup>)}
    <CommandSeparator /><CommandGroup><CommandItem value="clear-properties" onSelect={() => onChange({})}>{tc("clearFilter")}</CommandItem></CommandGroup>
  </>;
}

export function CollectionFilterMenu(props: CollectionFilterProps) {
  const [open, setOpen] = useState(false);
  const tc = useTranslations("Common");
  const active = Object.values(props.filters).some((values) => values?.length);
  return <SearchMenu open={open} onOpenChange={setOpen} align="end" tooltip={tc("filters")}
    trigger={<Button variant="ghost" size="icon-sm" aria-label={tc("filters")}><HugeiconsIcon icon={FilterIcon} className={active ? "text-primary" : undefined} /></Button>}>
    <CollectionFilterItems {...props} />
  </SearchMenu>;
}
