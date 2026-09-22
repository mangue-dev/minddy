import { describe, expect, it } from "vitest";

import {
  buildViewFiltersSpec,
  filtersOfAnswers,
  VIEW_FILTER_NONE_VALUE,
  type ViewFilterFacets,
} from "./view-filters-ai";

const facets: ViewFilterFacets = {
  statuses: [
    { value: "todo", label: "Todo" },
    { value: "in_progress", label: "In progress" },
    { value: "done", label: "Done" },
  ],
  priorities: [
    { value: "urgent", label: "Urgent" },
    { value: "high", label: "High" },
    { value: "low", label: "Low" },
  ],
  efforts: [{ value: "m", label: "M" }],
  assignees: [
    { value: "@me", label: "Assigned to me" },
    { value: VIEW_FILTER_NONE_VALUE, label: "Unassigned" },
    { value: "user-1", label: "Alice" },
  ],
  categories: [
    { value: "cat-1", label: "Bug" },
    { value: "cat-2", label: "Feature" },
  ],
  objectives: [
    { value: VIEW_FILTER_NONE_VALUE, label: "No objective" },
    { value: "obj-1", label: "Launch" },
  ],
  projects: [
    { value: "proj-1", label: "Alpha" },
    { value: "proj-2", label: "Beta" },
  ],
};

describe("buildViewFiltersSpec", () => {
  it("asks one multi-choice question per facet, over the REAL options", () => {
    const spec = buildViewFiltersSpec({ wish: "urgent bugs", projectId: "proj-1", facets });
    const keys = spec.questions.map((q) => q.key);
    expect(keys).toEqual([
      "status",
      "priority",
      "effort",
      "assignee",
      "category",
      "objective",
    ]);
    for (const question of spec.questions) {
      expect(question.kind).toBe("multi_choice");
      if (question.kind === "multi_choice") {
        for (const option of question.options) {
          // Real ids or enum values only — the engines can never invent.
          expect(option.value).not.toBe("");
        }
      }
    }
  });

  it("offers the project facet only on the global board", () => {
    const global = buildViewFiltersSpec({ wish: "w", projectId: null, facets });
    expect(global.questions.map((q) => q.key)).toContain("project");
    const scoped = buildViewFiltersSpec({ wish: "w", projectId: "proj-1", facets });
    expect(scoped.questions.map((q) => q.key)).not.toContain("project");
  });

  it("carries the wish verbatim in the state and the LLM user message", () => {
    const spec = buildViewFiltersSpec({ wish: "my urgent issues", projectId: null, facets });
    expect(spec.state).toMatchObject({ request: "my urgent issues" });
    expect(spec.llm.userMessage).toContain("my urgent issues");
  });

  it("skips a facet with no options instead of asking an unanswerable question", () => {
    const empty = buildViewFiltersSpec({
      wish: "w",
      projectId: "proj-1",
      facets: { ...facets, categories: [] },
    });
    expect(empty.questions.map((q) => q.key)).not.toContain("category");
  });
});

describe("filtersOfAnswers", () => {
  it("keeps only values the spec offered and folds the none sentinel to null", () => {
    const spec = buildViewFiltersSpec({ wish: "w", projectId: null, facets });
    const filters = filtersOfAnswers(spec, {
      status: { value: ["todo", "in_progress"] },
      assignee: { value: [VIEW_FILTER_NONE_VALUE, "user-1", "user-hallucinated"] },
      project: { value: ["proj-2"] },
    });
    expect(filters.status).toEqual(["todo", "in_progress"]);
    // The hallucinated id is dropped, the sentinel becomes a filter null.
    expect(filters.assignee).toEqual([null, "user-1"]);
    expect(filters.project).toEqual(["proj-2"]);
    // Unmentioned facets stay unfiltered — never "filter everything out".
    expect(filters.priority).toBeUndefined();
    expect(filters.category).toBeUndefined();
  });

  it("treats an empty or missing answer as 'do not filter on it'", () => {
    const spec = buildViewFiltersSpec({ wish: "w", projectId: "proj-1", facets });
    expect(filtersOfAnswers(spec, { status: { value: [] } })).toEqual({});
    expect(filtersOfAnswers(spec, {})).toEqual({});
  });

  it("drops non-array answers instead of throwing", () => {
    const spec = buildViewFiltersSpec({ wish: "w", projectId: "proj-1", facets });
    expect(filtersOfAnswers(spec, { status: { value: "todo" } })).toEqual({});
  });
});
