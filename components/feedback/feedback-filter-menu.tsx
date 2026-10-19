"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { HugeiconsIcon } from "@hugeicons/react";
import { FilterIcon, CancelCircleIcon as Ban } from "@hugeicons/core-free-icons";
import { AppIcon } from "@/components/icon";
import { FilterMenu, FilterSub, FilterItem, MenuToggleRow } from "@/components/filter-menu";
import { StatusIndicator } from "@/components/issue-indicators";
import { FeedbackPropertyFilterItems } from "./feedback-property-filters";
import { SIDEBAR_COMPACT_CONTROL_CLASS } from "@/lib/sidebar-control-styles";
import { FEEDBACK_POST_STATUSES, FEEDBACK_TO_ISSUE_STATUS, type FeedbackPostStatus } from "@/lib/feedback/types";
import type { FeedbackPropertyFilters } from "@/lib/collection-filters";
import type { Category, Objective } from "@/lib/types";
import type { MessageKey } from "@/lib/i18n-keys";
import type { TeamFeedbackListItem } from "@/lib/server/feedback/team-queries";
import type { TeamFeedbackUserOption } from "@/app/api/projects/[id]/feedback/users/route";

export type FeedbackStateFilter = "unresolved" | FeedbackPostStatus | "all";

/** The order of the column. `top` (the most supported first) is that of
    server and public board; the other two are chronological. */
export type FeedbackSort = "top" | "recent" | "oldest";

const SORTS: ReadonlyArray<{
  value: FeedbackSort;
  label: MessageKey<"FeedbackBoard">;
}> = [
  { value: "top", label: "sortTop" },
  { value: "recent", label: "sortRecent" },
  { value: "oldest", label: "sortOldest" },
];


export function FeedbackFilterMenu({
  projectId,
  state,
  sort,
  onlyToReview,
  toReviewCount,
  onStateChange,
  onSortChange,
  onToReviewChange,
  properties,
  onPropertiesChange,
  objectives,
  categories,
  posts,
  boardEnabled,
}: {
  projectId: string;
  properties: FeedbackPropertyFilters;
  onPropertiesChange: (filters: FeedbackPropertyFilters) => void;
  objectives: Objective[];
  categories: Category[];
  posts: TeamFeedbackListItem[];
  boardEnabled: boolean;
  state: FeedbackStateFilter;
  sort: FeedbackSort;
  onlyToReview: boolean;
  toReviewCount: number;
  onStateChange: (state: FeedbackStateFilter) => void;
  onSortChange: (sort: FeedbackSort) => void;
  onToReviewChange: (only: boolean) => void;
}) {
  const t = useTranslations("FeedbackBoard");
  const tStatus = useTranslations("PublicFeedback");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: authorData } = useQuery({
    queryKey: ["feedback-filter-authors", projectId, search.trim()],
    enabled: open,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/projects/${projectId}/feedback/users?q=${encodeURIComponent(search.trim())}`, { signal });
      if (!response.ok) throw new Error("Unable to load feedback authors");
      return response.json() as Promise<{ users: TeamFeedbackUserOption[] }>;
    },
  });
  const authors = useMemo(() => authorData?.users ?? [], [authorData]);

  const stateLabel =
    state === "unresolved"
      ? t("filterUnresolved")
      : state === "all"
        ? t("filterAll")
        : tStatus(`status.${state}`);
  // “Open, by popularity, everything” is the starting point: nothing to report.
  const active = state !== "unresolved" || sort !== "top" || onlyToReview || Object.values(properties).some((values) => values?.length);
  const tooltip = t("filterTooltip", { state: stateLabel });

  return <FilterMenu open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSearch(""); }} label={tooltip}
    trigger={<Button variant="ghost" size="icon-sm" className={SIDEBAR_COMPACT_CONTROL_CLASS} aria-label={tooltip}>
      <HugeiconsIcon icon={FilterIcon} className={active ? "size-[18px] text-primary" : "size-[18px]"} />
    </Button>}>
    <FilterSub label={t("filterStateLabel")} count={state === "unresolved" ? 0 : 1}>
      <MenuToggleRow active={state === "unresolved"} onSelect={() => onStateChange("unresolved")}>{t("filterUnresolved")}</MenuToggleRow>
      {FEEDBACK_POST_STATUSES.map((value) => <MenuToggleRow key={value} active={state === value} onSelect={() => onStateChange(value)}>
        {value === "spam" ? <AppIcon icon={Ban} className="size-4 shrink-0 text-muted-foreground" /> : <StatusIndicator status={FEEDBACK_TO_ISSUE_STATUS[value]} className="size-4 shrink-0" />}
        <span className="truncate">{tStatus(`status.${value}`)}</span>
      </MenuToggleRow>)}
      <MenuToggleRow active={state === "all"} onSelect={() => onStateChange("all")}>{t("filterAll")}</MenuToggleRow>
    </FilterSub>
    <FeedbackPropertyFilterItems filters={properties} onChange={onPropertiesChange} objectives={objectives}
      categories={categories} posts={posts} authors={authors} boardEnabled={boardEnabled} authorSearch={search} onAuthorSearchChange={setSearch} />
    <DropdownMenuSeparator />
    {toReviewCount > 0 && <MenuToggleRow active={onlyToReview} onSelect={() => onToReviewChange(!onlyToReview)}>
      <span className="min-w-0 flex-1 truncate">{t("filterToReview")}</span>
      <span className="text-xs tabular-nums text-muted-foreground">{toReviewCount}</span>
    </MenuToggleRow>}
    <FilterSub label={t("filterSortLabel")} count={0}>
      {SORTS.map((option) => <MenuToggleRow key={option.value} active={sort === option.value} onSelect={() => onSortChange(option.value)}>{t(option.label)}</MenuToggleRow>)}
    </FilterSub>
    <DropdownMenuSeparator />
    <FilterItem onSelect={() => { onPropertiesChange({}); onStateChange("unresolved"); onSortChange("top"); onToReviewChange(false); }}>{t("resetFilters")}</FilterItem>
  </FilterMenu>;
}
