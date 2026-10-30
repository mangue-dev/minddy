import type { QueryClient } from "@tanstack/react-query";
import { feedbackWrites } from "@/lib/optimistic/feedback-writes";
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
      const startedAt = Date.now();
      const params = collectionFilterParams(filters, new URLSearchParams());
      for (const status of filters.statuses ?? []) params.append("statuses", status);
      const scope = params.size ? `?${params}` : "";
      const response = await fetch(`/api/projects/${projectId}/feedback${scope}`, { signal, cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Unable to load feedback");
      // `total` counts the whole project, not the filtered `posts`.
      const result = data as { posts: TeamFeedbackListItem[]; total?: number; board_enabled: boolean };
      // A row's write still pending wins over a response that left before it.
      return { ...result, posts: feedbackWrites.apply(result.posts, startedAt) };
    },
  };
}

/** The URL-owned normal scope of a destination; retained controls and `post` never shape it. */
export function feedbackNormalFiltersForDestination(href: string): FeedbackListFilters {
  const params = new URL(href, "https://minddy.example").searchParams;
  const filters = parseFeedbackListFilters(params) ?? {};
  if (!params.has("objective")) filters.statuses = [...FEEDBACK_OPEN_STATUSES];
  return filters;
}

/**
 * Prepare the same scope that a fresh feedback destination initially displays:
 * the consumer's accepted normal list when it contains `post`, otherwise the
 * full list. It only chooses an existing reader and never writes either key.
 */
export function feedbackFiltersForDestination(client: QueryClient, projectId: string, href: string): FeedbackListFilters {
  const post = new URL(href, "https://minddy.example").searchParams.get("post");
  return feedbackFiltersForRequestedPost(client, projectId, post, feedbackNormalFiltersForDestination(href));
}

/** Every list key a destination may resolve to; their state changes can move it. */
export function feedbackDestinationSourceKeys(projectId: string, href: string): (readonly unknown[])[] {
  const normal = feedbackQueryOptions(projectId, feedbackNormalFiltersForDestination(href)).queryKey;
  return new URL(href, "https://minddy.example").searchParams.has("post") ? [normal, feedbackQueryOptions(projectId, {}).queryKey] : [normal];
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
