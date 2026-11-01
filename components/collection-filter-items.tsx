"use client";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { FilterIcon } from "@hugeicons/core-free-icons";
import { FilterMenu, filterFacet, filterToggle } from "@/components/filter-menu";
import type { ContextMenuAction } from "@/components/issue-context-menu";
import { SIDEBAR_HEADER_ACTION_CLASS } from "@/lib/sidebar-control-styles";
import { cn } from "@/lib/utils";
import { EFFORTS, PRIORITIES } from "@/lib/issue-constants";
import { ME_ASSIGNEE } from "@/lib/view-filter";
import { displayName } from "@/lib/display-name";
import { ObjectivePill } from "@/components/objective-label";
import type { Category, Member, Objective, ViewFilters } from "@/lib/types";

export type CollectionFilterProps = {
  filters: ViewFilters; onChange: (filters: ViewFilters) => void;
  members: Member[]; categories: Category[]; objectives: Objective[];
  integrations?: { id: string; name: string }[];
};

function useCollectionFilterActions({ filters, onChange, members, categories, objectives, integrations }: CollectionFilterProps): ContextMenuAction[] {
  const tf = useTranslations("Field");
  const tc = useTranslations("Common");
  const tp = useTranslations("Priority");
  const tActivity = useTranslations("Activity");
  const facets: { key: "priority" | "effort" | "assignee" | "objective" | "category" | "integration"; label: string; options: { value: string | null; label: string; node?: ReactNode }[] }[] = [
    { key: "priority", label: tf("priority"), options: PRIORITIES.map((p) => ({ value: p.value, label: tp(p.value) })) },
    { key: "effort", label: tf("effort"), options: [{ value: null, label: tf("effortNone") }, ...EFFORTS.map((e) => ({ value: e.value, label: e.label }))] },
    { key: "assignee", label: tf("assignee"), options: [{ value: ME_ASSIGNEE, label: tf("assignedToMe") }, { value: null, label: tf("unassigned") }, ...members.map((m) => ({ value: m.user_id, label: displayName(m, tActivity("memberSomeone")) }))] },
    { key: "objective", label: tf("objective"), options: [{ value: null, label: tc("none") }, ...objectives.map((o) => ({ value: o.id, label: o.name, node: <ObjectivePill objective={o} /> }))] },
    { key: "category", label: tf("categories"), options: categories.map((c) => ({ value: c.id, label: c.name })) },
    ...(integrations ? [{ key: "integration" as const, label: tf("integration"), options: [{ value: null, label: tc("none") }, ...integrations.map((i) => ({ value: i.id, label: i.name }))] }] : []),
  ];
  return [
    ...facets.filter((facet) => facet.options.length).map(({ key, label, options }) => filterFacet({
      id: key, label, count: filters[key]?.length ?? 0,
      children: options.map((option) => {
        const selected = filters[key] as (string | null)[] | undefined ?? [];
        const active = selected.includes(option.value);
        return filterToggle({
          id: option.value ?? "none", label: option.label, labelNode: option.node, active,
          onToggle: () => onChange({ ...filters, [key]: active ? selected.filter((value) => value !== option.value) : [...selected, option.value] }),
        });
      }),
    })),
    { id: "clear", label: tc("clearFilter"), separatorBefore: true, onSelect: () => onChange({}) },
  ];
}

export function CollectionFilterMenu(props: CollectionFilterProps) {
  const tc = useTranslations("Common");
  const actions = useCollectionFilterActions(props);
  const active = Object.values(props.filters).some((values) => values?.length);
  return <FilterMenu label={tc("filters")} actions={actions}
    trigger={<Button variant="ghost" size="icon-sm" className={SIDEBAR_HEADER_ACTION_CLASS} aria-label={tc("filters")}><HugeiconsIcon icon={FilterIcon} className={cn("size-4", active && "text-primary")} /></Button>} />;
}
