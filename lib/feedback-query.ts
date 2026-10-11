import { collectionFilterParams } from "./collection-filters";
import { parseFeedbackListFilters, type FeedbackListFilters } from "./feedback-list-filters";
import { FEEDBACK_OPEN_STATUSES } from "./feedback/types";
import type { TeamFeedbackListItem } from "./server/feedback/team-queries";

/** The team view and tab preparation consume the same authorized query. */
export function feedbackQueryOptions(projectId: string, filters: FeedbackListFilters = { statuses: [...FEEDBACK_OPEN_STATUSES] }) {
  return {
    queryKey: Object.values(filters).some((values) => values?.length) ? ["feedback", projectId, filters] as const : ["feedback", projectId] as const,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const params = collectionFilterParams(filters, new URLSearchParams());
      for (const status of filters.statuses ?? []) params.append("statuses", status);
      const scope = params.size ? `?${params}` : "";
      const response = await fetch(`/api/projects/${projectId}/feedback${scope}`, { signal, cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Unable to load feedback");
      return data as { posts: TeamFeedbackListItem[]; board_enabled: boolean };
    },
  };
}

/** Prepare the same scope that a fresh feedback destination initially displays. */
export function feedbackFiltersForDestination(href: string): FeedbackListFilters {
  const params = new URL(href, "https://minddy.example").searchParams;
  if (params.has("post")) return {};
  const filters = parseFeedbackListFilters(params) ?? {};
  if (!params.has("objective")) filters.statuses = [...FEEDBACK_OPEN_STATUSES];
  return filters;
}
