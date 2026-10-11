import type { FeedbackPropertyFilters } from "./collection-filters";
import { FEEDBACK_POST_STATUSES, type FeedbackPostStatus } from "./feedback/types";

export type FeedbackListFilters = FeedbackPropertyFilters & { statuses?: FeedbackPostStatus[] };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId = (value: string) => uuid.test(value);

/** Validate repeated filter parameters before constructing database predicates. */
export function parseFeedbackListFilters(params: URLSearchParams): FeedbackListFilters | null {
  const filters: FeedbackListFilters = {};
  for (const field of ["objective", "author", "category"] as const) {
    const values = [...new Set(params.getAll(field))];
    if (values.length > 100 || values.some((v) => !(field !== "category" && v === "none") && !validId(v))) return null;
    if (values.length) {
      if (field === "category") filters.category = values;
      else filters[field] = values.map((v) => v === "none" ? null : v);
    }
  }
  const choices = { visibility: ["public", "private"], source: ["board", "api", "internal"], review: ["pending", "published"], statuses: FEEDBACK_POST_STATUSES };
  for (const field of ["visibility", "source", "review", "statuses"] as const) {
    const values = [...new Set(params.getAll(field))];
    if (values.length > choices[field].length || values.some((v) => !(choices[field] as readonly string[]).includes(v))) return null;
    if (values.length) Object.assign(filters, { [field]: values });
  }
  return filters;
}
