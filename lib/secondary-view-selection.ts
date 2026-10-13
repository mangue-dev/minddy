import { matchesFeedbackFilters, type FeedbackPropertyFilters } from "./collection-filters";
import { isResolvedFeedbackStatus } from "./feedback/types";
import type { FeedbackSort, FeedbackStateFilter } from "@/components/feedback/feedback-filter-menu";
import type { TeamFeedbackListItem } from "./server/feedback/team-queries";
import type { Issue, Objective } from "./types";
import type { ObjectiveStatus } from "./objective-constants";

/** Explicit destinations win; otherwise preserve a valid selection before falling back. */
export function secondarySelectionId<T extends { id: string }>(visible: readonly T[], requested: string | null = null,
  current: string | null = null, all: readonly T[] = visible): string | null {
  if (requested && all.some((row) => row.id === requested)) return requested;
  return current && visible.some((row) => row.id === current) ? current : visible[0]?.id ?? null;
}

export function triageSelectionItems(issues: readonly Issue[]): Issue[] {
  return issues.filter((issue) => issue.status === "triage").sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function matchesObjectiveState(objective: Objective, state: "active" | "all" | ObjectiveStatus): boolean {
  return state === "all" || (state === "active" ? ["planned", "in_progress"].includes(objective.status) : objective.status === state);
}

export function feedbackNeedsHumanReview(post: TeamFeedbackListItem): boolean {
  return post.review_state !== "published" || post.sensitivity !== null;
}

export function matchesFeedbackState(post: TeamFeedbackListItem, state: FeedbackStateFilter): boolean {
  return state === "all" || (state === "unresolved" ? !isResolvedFeedbackStatus(post.status) : post.status === state);
}

/** Text search narrows the column, while these controls determine detail selection. */
export function feedbackSelectionItems(posts: readonly TeamFeedbackListItem[], {
  state = "unresolved", sort = "top", onlyToReview = false, properties = {},
}: { state?: FeedbackStateFilter; sort?: FeedbackSort; onlyToReview?: boolean; properties?: FeedbackPropertyFilters } = {}): TeamFeedbackListItem[] {
  const rows = posts.filter((post) => matchesFeedbackState(post, state) &&
    (!onlyToReview || feedbackNeedsHumanReview(post)) && matchesFeedbackFilters(post, properties));
  if (sort === "top") rows.sort((a, b) => b.vote_count - a.vote_count || Date.parse(b.created_at) - Date.parse(a.created_at));
  else { rows.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)); if (sort === "recent") rows.reverse(); }
  return rows;
}
