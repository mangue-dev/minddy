import { feedbackFiltersForDestination, feedbackQueryOptions } from "./feedback-query";
import { describe, expect, it } from "vitest";
import { collectionFilterParams, matchesCollectionFilters, matchesFeedbackFilters, readCollectionFilters } from "./collection-filters";

const feedback = { objective_id: "goal-a", category_ids: ["bug"], author_id: "visitor-a", is_public: false, source: "api", review_state: "published" };

describe("feedback property filters", () => {
  it("combines existing feedback properties without reading linked issue properties", () => {
    expect(matchesFeedbackFilters(feedback, { objective: ["goal-a"], category: ["feature", "bug"], author: ["visitor-a"], visibility: ["private"], source: ["api"], review: ["published"] })).toBe(true);
    for (const filters of [{ objective: ["other"] }, { category: ["feature"] }, { author: [null] }, { visibility: ["public"] }, { source: ["internal"] }, { review: ["pending"] }]) {
      expect(matchesFeedbackFilters(feedback, filters)).toBe(false);
    }
    expect(matchesFeedbackFilters({ ...feedback, objective_id: null, author_id: null }, { objective: [null], author: [null] })).toBe(true);
  });
  it("round-trips a filtered objective destination and preserves unrelated selections", () => {
    const filters = { objective: ["goal-a", null], author: ["visitor-a", null], source: ["api"], category: ["bug"] };
    const params = collectionFilterParams(filters, new URLSearchParams("post=request-a&objective=old"));
    expect(params.get("post")).toBe("request-a");
    expect(readCollectionFilters(params)).toEqual(filters);
    expect(collectionFilterParams({}, params).toString()).toBe("post=request-a");
  });
});

describe("triage property filters", () => {
  const issue = { priority: "high", effort: "s", assignee_id: "member", category_ids: ["bug"], objective_id: "goal-a", integration_id: "api-a" };
  it("matches board semantics for multiple values and the current assignee", () => {
    expect(matchesCollectionFilters(issue, { priority: ["low", "high"], effort: ["s"], assignee: ["@me"], objective: ["goal-a"], category: ["bug"], integration: ["api-a"] }, "member")).toBe(true);
    expect(matchesCollectionFilters(issue, { assignee: ["@me"] }, "other")).toBe(false);
    expect(matchesCollectionFilters({ ...issue, effort: null }, { effort: ["s"] }, "member")).toBe(false);
    expect(matchesCollectionFilters({ category_ids: [] }, { assignee: [null], objective: [null], integration: [null] }, null)).toBe(true);
  });
});

it("prepares objective feedback with all statuses and ordinary feedback with unresolved statuses", () => {
  const goal = "11111111-1111-4111-8111-111111111111";
  expect(feedbackFiltersForDestination(`/projects/p/feedback?objective=${goal}`)).toEqual({ objective: [goal] });
  expect(feedbackFiltersForDestination("/projects/p/feedback")).toEqual({ statuses: ["open", "planned", "in_progress"] });
  expect(feedbackFiltersForDestination("/projects/p/feedback?post=selected")).toEqual({});
  expect(feedbackQueryOptions("p").queryKey).toEqual(["feedback", "p", { statuses: ["open", "planned", "in_progress"] }]);
});
