"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { FilterIcon } from "@hugeicons/core-free-icons";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { FilterMenu, MenuToggleRow } from "@/components/filter-menu";
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
export function StatusFilterRows({
  status,
  onChange,
}: {
  status: readonly IssueStatus[] | null | undefined;
  onChange: (next: IssueStatus[] | undefined) => void;
}) {
  const ts = useTranslations("Status");
  const selected = effectiveStatuses(status);
  return (
    <>
      {STATUSES.map((s) => (
        <MenuToggleRow
          key={s.value}
          active={selected.includes(s.value)}
          onSelect={() => onChange(toggleStatusFilter(status, s.value))}
        >
          <StatusIndicator status={s.value} className="size-4" />
          {ts(s.value)}
        </MenuToggleRow>
      ))}
    </>
  );
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
  const [open, setOpen] = useState(false);
  const tf = useTranslations("Field");
  const label = tf("status");
  return (
    <FilterMenu
      open={open}
      onOpenChange={setOpen}
      label={label}
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={label}>
          <HugeiconsIcon
            icon={FilterIcon}
            className={cn(!isDefaultStatusFilter(status ?? undefined) && "text-primary")}
          />
        </Button>
      }
    >
      <StatusFilterRows status={status} onChange={onChange} />
    </FilterMenu>
  );
}
