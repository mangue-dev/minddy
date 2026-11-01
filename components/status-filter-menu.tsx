"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { FilterIcon } from "@hugeicons/core-free-icons";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { FilterMenu, filterToggle } from "@/components/filter-menu";
import type { ContextMenuAction } from "@/components/issue-context-menu";
import { StatusIndicator } from "@/components/issue-indicators";
import { STATUSES, type IssueStatus } from "@/lib/issue-constants";
import {
  effectiveStatuses,
  isDefaultStatusFilter,
  toggleStatusFilter,
} from "@/lib/view-filter";
import { cn } from "@/lib/utils";

/** The status rows of a filter menu — the board toolbar's Status facet and
    the standalone menu below share them. */
export function useStatusFilterActions(
  status: readonly IssueStatus[] | null | undefined,
  onChange: (next: IssueStatus[] | undefined) => void,
): ContextMenuAction[] {
  const ts = useTranslations("Status");
  const selected = effectiveStatuses(status);
  return STATUSES.map((s) => filterToggle({
    id: s.value,
    label: ts(s.value),
    icon: <StatusIndicator status={s.value} className="size-4" />,
    active: selected.includes(s.value),
    onToggle: () => onChange(toggleStatusFilter(status, s.value)),
  }));
}

/** A status-only filter for boards without a saved view: the objective,
    issue-family and cycle boards. Accent-coloured once it leaves the
    default open statuses. */
export function StatusFilterMenu({
  status,
  onChange,
}: {
  status: readonly IssueStatus[] | null | undefined;
  onChange: (next: IssueStatus[] | undefined) => void;
}) {
  const tf = useTranslations("Field");
  const label = tf("status");
  const actions = useStatusFilterActions(status, onChange);
  return (
    <FilterMenu
      label={label}
      actions={actions}
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={label}>
          <HugeiconsIcon
            icon={FilterIcon}
            className={cn(!isDefaultStatusFilter(status ?? undefined) && "text-primary")}
          />
        </Button>
      }
    />
  );
}
