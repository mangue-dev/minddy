import type { ViewFilters } from "@/lib/types";
import { ME_ASSIGNEE } from "@/lib/view-filter";

export type CollectionFilterFields = {
  priority?: string; effort?: string | null; assignee_id?: string | null;
  objective_id?: string | null; category_ids: string[]; integration_id?: string | null;
};

/** OR within a property, AND across properties, matching the board. */
export function matchesCollectionFilters(item: CollectionFilterFields, filters: ViewFilters, userId: string | null) {
  const assignees = filters.assignee?.map((id) => id === ME_ASSIGNEE ? userId ?? ME_ASSIGNEE : id);
  return (!filters.priority?.length || filters.priority.includes((item.priority ?? "none") as NonNullable<ViewFilters["priority"]>[number])) &&
    (!filters.effort?.length || filters.effort.includes((item.effort ?? null) as NonNullable<ViewFilters["effort"]>[number])) &&
    (!assignees?.length || assignees.includes(item.assignee_id ?? null)) &&
    (!filters.objective?.length || filters.objective.includes(item.objective_id ?? null)) &&
    (!filters.category?.length || filters.category.some((id) => item.category_ids.includes(id))) &&
    (!filters.integration?.length || filters.integration.includes(item.integration_id ?? null));
}

export type FeedbackPropertyFilters = {
  objective?: (string | null)[]; category?: string[]; author?: (string | null)[];
  visibility?: string[]; source?: string[]; review?: string[];
};
export type CollectionFilters = ViewFilters & FeedbackPropertyFilters;

export function matchesFeedbackFilters(item: {
  objective_id: string | null; category_ids: string[]; author_id: string | null;
  is_public: boolean; source: string; review_state: string;
}, filters: FeedbackPropertyFilters) {
  return (!filters.objective?.length || filters.objective.includes(item.objective_id)) &&
    (!filters.category?.length || filters.category.some((id) => item.category_ids.includes(id))) &&
    (!filters.author?.length || filters.author.includes(item.author_id)) &&
    (!filters.visibility?.length || filters.visibility.includes(item.is_public ? "public" : "private")) &&
    (!filters.source?.length || filters.source.includes(item.source)) &&
    (!filters.review?.length || filters.review.includes(item.review_state));
}

const parameters = { priority: "priority", effort: "effort", assignee: "assignee", objective: "objective", category: "category", integration: "integration", author: "author", visibility: "visibility", source: "source", review: "review" } as const;
export function collectionFilterParams(filters: CollectionFilters, base: URLSearchParams) {
  const params = new URLSearchParams(base);
  for (const [field, parameter] of Object.entries(parameters)) {
    params.delete(parameter);
    for (const value of filters[field as keyof typeof parameters] ?? []) params.append(parameter, value ?? "none");
  }
  return params;
}
export function readCollectionFilters(params: URLSearchParams): CollectionFilters {
  const filters: Record<string, (string | null)[]> = {};
  for (const [field, parameter] of Object.entries(parameters)) {
    const values = params.getAll(parameter);
    if (values.length) filters[field] = values.map((value) => value === "none" && ["effort", "assignee", "objective", "integration", "author"].includes(field) ? null : value);
  }
  return filters as CollectionFilters;
}
