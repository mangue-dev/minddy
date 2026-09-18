import { describe, expect, it } from "vitest";

import { buildFeedbackReviewSpec, buildSmartAssignSpec, buildSmartFillSpec } from "./prepare";
import type { SmartFillContext } from "@/lib/server/smart-fill";

/**
 * The builders are the guarantee that both engines see the SAME world: real
 * ids only (an engine may pick a wrong one, never invent one), the same
 * caps as the LLM prompts, and the LLM recipe replayed verbatim.
 */

const CTX: SmartFillContext = {
  categories: [
    { id: "cat-bug", name: "Bug" },
    { id: "cat-feat", name: "Feature" },
  ],
  objectives: [{ id: "obj-v2", name: "v2", status: "in_progress" }],
};

describe("buildSmartFillSpec", () => {
  const spec = buildSmartFillSpec({
    projectName: "minddy",
    title: "Fix the flaky test",
    description: "It fails on CI once in five runs.",
    ctx: CTX,
  });

  it("asks the four fill_issue questions, keyed like the tool arguments", () => {
    expect(spec.useCase).toBe("smart_fill");
    expect(spec.questions.map((q) => q.key)).toEqual([
      "priority",
      "effort",
      "category_ids",
      "objective_id",
    ]);
  });

  it("offers only real ids and real enums, with the nothing-sentinels", () => {
    const priority = spec.questions.find((q) => q.key === "priority");
    expect(priority?.kind).toBe("single_choice");
    const objective = spec.questions.find((q) => q.key === "objective_id");
    expect(objective?.kind === "single_choice" && objective.options.map((o) => o.value)).toEqual([
      "obj-v2",
      "none",
    ]);
    const categories = spec.questions.find((q) => q.key === "category_ids");
    expect(
      categories?.kind === "multi_choice" &&
        categories.options.map((o) => o.value).join(",")
    ).toBe("cat-bug,cat-feat");
    expect(categories?.kind === "multi_choice" && categories.maxSelections).toBe(3);
  });

  it("builds the dense state from the same sources", () => {
    expect(spec.state).toMatchObject({
      project: "minddy",
      issue: { title: "Fix the flaky test", description: "It fails on CI once in five runs." },
      categories: CTX.categories,
      objectives: CTX.objectives,
    });
  });

  it("replays the existing pass verbatim as the LLM recipe", () => {
    expect(spec.llm.toolName).toBe("fill_issue");
    expect(spec.llm.systemPrompt).toContain('minddy');
    expect(spec.llm.systemPrompt).toContain('"Bug" (id: cat-bug)');
    expect(spec.llm.userMessage).toContain("Fix the flaky test");
  });

  it("caps the option lists at the same 60-item ceiling as the prompt", () => {
    const many = {
      categories: Array.from({ length: 70 }, (_, i) => ({ id: `cat-${i}`, name: `c${i}` })),
      objectives: [],
    };
    const spec70 = buildSmartFillSpec({
      projectName: "p",
      title: "t",
      description: null,
      ctx: many,
    });
    const categories = spec70.questions.find((q) => q.key === "category_ids");
    expect(categories?.kind === "multi_choice" && categories.options).toHaveLength(60);
    expect(spec70.state.categories).toHaveLength(60);
  });
});

describe("buildSmartAssignSpec", () => {
  const spec = buildSmartAssignSpec({
    projectName: "minddy",
    issue: {
      title: "Where does this go?",
      description: "  ",
      categories: "Bug",
      priority: "high",
      effort: null,
    },
    members: [
      { id: "user-owner", name: "Clément", owner: true, rule: "  " },
      { id: "user-dev", name: "Ada", owner: false, rule: "Everything about the tests" },
    ],
  });

  it("offers exactly the real member ids", () => {
    expect(spec.questions).toHaveLength(1);
    const question = spec.questions[0];
    expect(question.key).toBe("user_id");
    expect(question.kind === "single_choice" && question.options.map((o) => o.value)).toEqual([
      "user-owner",
      "user-dev",
    ]);
  });

  it("carries the members, their owner mark and their trimmed rules in the state", () => {
    expect(spec.state.members).toEqual([
      { id: "user-owner", name: "Clément", owner: true, rule: null },
      { id: "user-dev", name: "Ada", owner: false, rule: "Everything about the tests" },
    ]);
  });

  it("replays the existing pass verbatim", () => {
    expect(spec.llm.toolName).toBe("choose_assignee");
    expect(spec.llm.systemPrompt).toContain("automatic issue router");
    expect(spec.llm.userMessage).toContain("(no rule)");
    expect(spec.llm.userMessage).toContain("Ada");
  });
});

describe("buildFeedbackReviewSpec", () => {
  const base = {
    post: { title: "Dark mode", body: "Please add a dark theme." },
    categories: [{ id: "cat-ui", name: "UI" }],
    translation: { enabled: true, teamLanguage: "en" as const, skipLanguages: [] },
  };

  it("always asks the moderation verdicts and the sensitivity kind", () => {
    const spec = buildFeedbackReviewSpec({ ...base, candidates: [] });
    expect(spec.useCase).toBe("feedback_review");
    expect(spec.questions.map((q) => q.key)).toEqual([
      "is_junk",
      "is_sensitive",
      "sensitivity_kind",
      // The base fixture carries one category: it is asked too.
      "category_ids",
    ]);
  });

  it("asks the duplicate verdict only when there is something to compare against", () => {
    const spec = buildFeedbackReviewSpec({
      ...base,
      candidates: [{ id: "post-1", title: "Dark theme", body: "same", similarity: 0.9 }],
    });
    const duplicate = spec.questions.find((q) => q.key === "duplicate_of");
    expect(duplicate?.kind).toBe("single_choice");
    expect(duplicate?.kind === "single_choice" && duplicate.options.map((o) => o.value)).toEqual([
      "post-1",
      "none",
    ]);
  });

  it("asks the categories only when the project defines some", () => {
    const withoutCategories = buildFeedbackReviewSpec({
      ...base,
      categories: [],
      candidates: [],
    });
    expect(withoutCategories.questions.map((q) => q.key)).toEqual([
      "is_junk",
      "is_sensitive",
      "sensitivity_kind",
    ]);
  });

  it("carries the full existing schema as the LLM recipe — translation included", () => {
    const spec = buildFeedbackReviewSpec({
      ...base,
      candidates: [{ id: "post-1", title: "Dark theme", body: "same", similarity: 0.9 }],
    });
    expect(spec.llm.toolName).toBe("review_feedback");
    expect(spec.llm.systemPrompt).toContain("review_feedback exactly once");
    expect(spec.llm.systemPrompt).toContain("translated_title");
    expect(spec.llm.userMessage).toContain("post-1");
    const properties = spec.llm.parameters.properties as Record<string, unknown>;
    expect(Object.keys(properties)).toContain("duplicate_of");
    expect(Object.keys(properties)).toContain("language");
  });
});
