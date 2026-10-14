import type { QueryClient } from "@tanstack/react-query";
import { matchesFeedbackFilters, collectionFilterParams } from "./collection-filters";
import { parseFeedbackListFilters, type FeedbackListFilters } from "./feedback-list-filters";
import { FEEDBACK_OPEN_STATUSES } from "./feedback/types";
import { feedbackNeedsHumanReview } from "./secondary-view-selection";
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

/** Reuse an exact accepted scope only when it already contains the requested post. */
export function feedbackFiltersForRequestedPost(client: QueryClient, projectId: string,
  postId: string | null, normalFilters: FeedbackListFilters, onlyToReview = false): FeedbackListFilters {
  if (!postId) return normalFilters;
  const state = client.getQueryState<{ posts: TeamFeedbackListItem[]; board_enabled: boolean }>(
    feedbackQueryOptions(projectId, normalFilters).queryKey);
  if (state?.status !== "success" || state.error || state.isInvalidated || !Array.isArray(state.data?.posts)) return {};
  const target = state.data.posts.find((post) => post.id === postId && post.project_id === projectId);
  if (!target ||
      (normalFilters.statuses?.length && !normalFilters.statuses.includes(target.status)) ||
      !matchesFeedbackFilters(target, normalFilters) ||
      (onlyToReview && !feedbackNeedsHumanReview(target))) return {};
  return normalFilters;
}
