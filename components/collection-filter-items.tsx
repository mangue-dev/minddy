"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { HugeiconsIcon } from "@hugeicons/react";
import { FilterIcon } from "@hugeicons/core-free-icons";
import { FilterMenu, FilterSub, FilterItem, MenuToggleRow } from "@/components/filter-menu";
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
    {facets.filter((facet) => facet.options.length).map(({ key, label, options }) => <FilterSub key={key} label={label} count={filters[key]?.length ?? 0}>
      {options.map((option) => {
        const selected = filters[key] as (string | null)[] | undefined ?? [];
        const active = selected.includes(option.value);
        return <MenuToggleRow key={option.value ?? "none"} active={active} onSelect={() => {
          onChange({ ...filters, [key]: active ? selected.filter((value) => value !== option.value) : [...selected, option.value] });
        }}><span className="truncate">{option.label}</span></MenuToggleRow>;
      })}
    </FilterSub>)}
    <DropdownMenuSeparator /><FilterItem onSelect={() => onChange({})}>{tc("clearFilter")}</FilterItem>
  </>;
}

export function CollectionFilterMenu(props: CollectionFilterProps) {
  const [open, setOpen] = useState(false);
  const tc = useTranslations("Common");
  const active = Object.values(props.filters).some((values) => values?.length);
  return <FilterMenu open={open} onOpenChange={setOpen} label={tc("filters")}
    trigger={<Button variant="ghost" size="icon-sm" aria-label={tc("filters")}><HugeiconsIcon icon={FilterIcon} className={active ? "text-primary" : undefined} /></Button>}>
    <CollectionFilterItems {...props} />
  </FilterMenu>;
}
