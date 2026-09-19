import { describe, expect, it } from "vitest";

import { mapLlmAnswers } from "./llm";
import type { DecisionSpec } from "./types";

/**
 * The mapping of the existing tool arguments into decision answers. Strict
 * on values (nothing outside the spec's real options survives), lenient on
 * absence — and for the feedback booleans, "absent" reads as "no", exactly
 * like the pass has always parsed it.
 */

const SPEC: DecisionSpec = {
  useCase: "smart_fill",
  state: { project: "p", issue: { title: "t" } },
  questions: [
    {
      key: "priority",
      kind: "single_choice",
      label: "priority",
      options: [
        { value: "none", label: "none" },
        { value: "high", label: "high" },
        { value: "low", label: "low" },
      ],
    },
    {
      key: "effort",
      kind: "single_choice",
      label: "effort",
      options: [
        { value: "m", label: "m" },
        { value: "none", label: "none" },
      ],
    },
    {
      key: "category_ids",
      kind: "multi_choice",
      label: "categories",
      options: [
        { value: "cat-a", label: "A" },
        { value: "cat-b", label: "B" },
      ],
      maxSelections: 1,
    },
  ],
  llm: { toolName: "fill_issue", parameters: {}, systemPrompt: "s", userMessage: "u" },
};

const FEEDBACK_SPEC: DecisionSpec = {
  useCase: "feedback_review",
  state: { post: { title: "t" } },
  questions: [
    { key: "is_junk", kind: "boolean", label: "junk?" },
    { key: "is_sensitive", kind: "boolean", label: "sensitive?" },
    {
      key: "sensitivity_kind",
      kind: "single_choice",
      label: "sensitivity",
      options: [
        { value: "security", label: "security" },
        { value: "none", label: "not sensitive" },
      ],
    },
    {
      key: "duplicate_of",
      kind: "single_choice",
      label: "duplicate",
      options: [
        { value: "post-1", label: "post-1" },
        { value: "none", label: "no duplicate" },
      ],
    },
    {
      key: "category_ids",
      kind: "multi_choice",
      label: "categories",
      options: [{ value: "cat-ui", label: "UI" }],
      maxSelections: 1,
    },
  ],
  llm: { toolName: "review_feedback", parameters: {}, systemPrompt: "s", userMessage: "u" },
};

describe("mapLlmAnswers — smart_fill", () => {
  it("keeps the well-formed values", () => {
    const answers = mapLlmAnswers(SPEC, {
      priority: "high",
      effort: "none",
      category_ids: ["cat-a", "cat-b"],
    });
    expect(answers.priority?.value).toBe("high");
    expect(answers.effort?.value).toBe("none");
    // Capped at the spec's cardinality.
    expect(answers.category_ids?.value).toEqual(["cat-a"]);
  });

  it("drops invented values instead of propagating them", () => {
    const answers = mapLlmAnswers(SPEC, {
      priority: "critical",
      effort: "XXL",
      category_ids: ["cat-invented"],
      objective_id: "obj-invented",
    });
    expect(answers).toEqual({});
  });

  it("produces no answer where the model stayed silent", () => {
    const answers = mapLlmAnswers(SPEC, { priority: "low" });
    expect(answers.priority?.value).toBe("low");
    expect(answers.effort).toBeUndefined();
  });
});

describe("mapLlmAnswers — smart_assign", () => {
  it("keeps a real member id", () => {
    const spec: DecisionSpec = {
      ...SPEC,
      useCase: "smart_assign",
      questions: [
        {
          key: "user_id",
          kind: "single_choice",
          label: "who",
          options: [{ value: "user-1", label: "Ada" }],
        },
      ],
    };
    const answers = mapLlmAnswers(spec, { user_id: "user-1" });
    expect(answers.user_id?.value).toBe("user-1");
  });
});

describe("mapLlmAnswers — feedback_review", () => {
  it("maps a full verdict", () => {
    const answers = mapLlmAnswers(FEEDBACK_SPEC, {
      is_junk: true,
      is_sensitive: false,
      sensitivity_kind: null,
      duplicate_of: "post-1",
      confidence: 0.87,
      category_ids: ["cat-ui", "cat-invented"],
    });
    expect(answers.is_junk?.value).toBe(true);
    expect(answers.sensitivity_kind?.value).toBe("none");
    expect(answers.duplicate_of).toEqual({ value: "post-1", probability: null, confidence: 0.87 });
    expect(answers.category_ids?.value).toEqual(["cat-ui"]);
  });

  it("reads an absent boolean as false, like the pass always has", () => {
    const answers = mapLlmAnswers(FEEDBACK_SPEC, {});
    expect(answers.is_junk?.value).toBe(false);
    expect(answers.is_sensitive?.value).toBe(false);
    expect(answers.sensitivity_kind?.value).toBe("none");
    expect(answers.duplicate_of?.value).toBe("none");
  });

  it("clamps an out-of-range duplicate confidence", () => {
    const answers = mapLlmAnswers(FEEDBACK_SPEC, { duplicate_of: "post-1", confidence: 4.2 });
    expect(answers.duplicate_of?.confidence).toBe(1);
  });

  it("never answers duplicate_of when the spec asked no such question", () => {
    const withoutDuplicate: DecisionSpec = {
      ...FEEDBACK_SPEC,
      questions: FEEDBACK_SPEC.questions.filter((q) => q.key !== "duplicate_of"),
    };
    const answers = mapLlmAnswers(withoutDuplicate, { duplicate_of: "post-1", confidence: 0.9 });
    expect(answers.duplicate_of).toBeUndefined();
  });
});

describe("mapLlmAnswers — smart_triage", () => {
  const TRIAGE_SPEC: DecisionSpec = {
    useCase: "smart_triage",
    state: { project: "p", tickets: [] },
    questions: [
      {
        key: "issue-1",
        kind: "score",
        label: "next?",
        levels: [1, 2, 3, 4, 5].map((value) => ({ value, label: String(value) })),
      },
      {
        key: "issue-2",
        kind: "score",
        label: "next?",
        levels: [1, 2, 3, 4, 5].map((value) => ({ value, label: String(value) })),
      },
    ],
    llm: { toolName: "score_tickets", parameters: {}, systemPrompt: "s", userMessage: "u" },
  };

  it("maps the forced tool's scores object, one answer per ticket id", () => {
    const answers = mapLlmAnswers(TRIAGE_SPEC, {
      scores: { "issue-1": 5, "issue-2": 1 },
    });
    expect(answers["issue-1"]).toEqual({ value: 5, probability: null, confidence: null });
    expect(answers["issue-2"]).toEqual({ value: 1, probability: null, confidence: null });
  });

  it("drops out-of-scale values and missing tickets — the consumer reads neutral", () => {
    const answers = mapLlmAnswers(TRIAGE_SPEC, {
      scores: { "issue-1": 9, "issue-2": 0, "issue-3": 4 },
    });
    expect(answers["issue-1"]).toBeUndefined();
    expect(answers["issue-2"]).toBeUndefined();
    expect(answers["issue-3"]).toBeUndefined();
  });

  it("ignores a malformed scores payload entirely", () => {
    expect(mapLlmAnswers(TRIAGE_SPEC, {})).toEqual({});
    expect(mapLlmAnswers(TRIAGE_SPEC, { scores: "nope" })).toEqual({});
    expect(mapLlmAnswers(TRIAGE_SPEC, { scores: ["nope"] })).toEqual({});
  });
});
