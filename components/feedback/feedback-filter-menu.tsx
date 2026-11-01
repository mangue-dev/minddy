"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { FilterIcon, CancelCircleIcon as Ban } from "@hugeicons/core-free-icons";
import { AppIcon } from "@/components/icon";
import { FilterMenu, filterFacet, filterToggle } from "@/components/filter-menu";
import type { ContextMenuAction } from "@/components/issue-context-menu";
import { StatusIndicator } from "@/components/issue-indicators";
import { useFeedbackPropertyFilterActions } from "./feedback-property-filters";
import { SIDEBAR_HEADER_ACTION_CLASS } from "@/lib/sidebar-control-styles";
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
  const propertyActions = useFeedbackPropertyFilterActions({ filters: properties, onChange: onPropertiesChange, objectives,
    categories, posts, authors, boardEnabled });

  const actions: ContextMenuAction[] = [
    filterFacet({ id: "state", label: t("filterStateLabel"), count: state === "unresolved" ? 0 : 1, children: [
      filterToggle({ id: "unresolved", label: t("filterUnresolved"), active: state === "unresolved", onToggle: () => onStateChange("unresolved") }),
      ...FEEDBACK_POST_STATUSES.map((value) => filterToggle({
        id: value, label: tStatus(`status.${value}`), active: state === value, onToggle: () => onStateChange(value),
        icon: value === "spam" ? <AppIcon icon={Ban} className="size-4 shrink-0 text-muted-foreground" /> : <StatusIndicator status={FEEDBACK_TO_ISSUE_STATUS[value]} className="size-4 shrink-0" />,
      })),
      filterToggle({ id: "all", label: t("filterAll"), active: state === "all", onToggle: () => onStateChange("all") }),
    ] }),
    ...propertyActions,
    ...(toReviewCount > 0 ? [filterToggle({ id: "to-review", label: t("filterToReview"), active: onlyToReview,
      trailing: toReviewCount, separatorBefore: true, onToggle: () => onToReviewChange(!onlyToReview) })] : []),
    filterFacet({ id: "sort", label: t("filterSortLabel"), count: 0, separatorBefore: toReviewCount === 0,
      children: SORTS.map((option) => filterToggle({ id: option.value, label: t(option.label), active: sort === option.value, onToggle: () => onSortChange(option.value) })) }),
    { id: "reset", label: t("resetFilters"), separatorBefore: true,
      onSelect: () => { onPropertiesChange({}); onStateChange("unresolved"); onSortChange("top"); onToReviewChange(false); } },
  ];

  return <FilterMenu label={tooltip} actions={actions} onOpenChange={setOpen} onQueryChange={setSearch}
    trigger={<Button variant="ghost" size="icon-sm" className={SIDEBAR_HEADER_ACTION_CLASS} aria-label={tooltip}>
      <HugeiconsIcon icon={FilterIcon} className={active ? "size-4 text-primary" : "size-4"} />
    </Button>} />;
}
