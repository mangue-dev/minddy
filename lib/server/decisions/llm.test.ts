import { afterEach, describe, expect, it, vi } from "vitest";

import { mapLlmAnswers, runLlmDecision } from "./llm";
import type { DecisionSpec } from "./types";

const { forcedToolCallMock } = vi.hoisted(() => ({ forcedToolCallMock: vi.fn() }));
vi.mock("@/lib/server/feedback/forced-tool-call", () => ({ forcedToolCall: forcedToolCallMock }));
vi.mock("@/lib/server/model-config", () => ({ resolveConfiguredModel: async () => ({ model: "reasoning-model" }) }));
afterEach(() => { vi.clearAllMocks(); });

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

  it("keeps an EMPTY category selection as the verdict it is (MIN-567 review)", () => {
    // The tool schema REQUIRES category_ids, so an empty array is a judged
    // "nothing fits" — silence would hide it from the shadow comparison.
    // The sanitizer still writes nothing for it, on the use case's side.
    const answers = mapLlmAnswers(SPEC, { category_ids: [] });
    expect(answers.category_ids?.value).toEqual([]);
  });
});

describe("runLlmDecision — Smart Fill generation", () => {
  it("leaves room for reasoning and the tool output within the creation timeout", async () => {
    forcedToolCallMock.mockResolvedValue({ priority: "high", effort: "m", category_ids: ["cat-a"] });
    const context = { runId: "fill-run", seq: 1, billTo: { userId: "creator" }, projectId: "project" };
    const answers = await runLlmDecision(SPEC, context);
    expect(forcedToolCallMock).toHaveBeenCalledWith(
      "reasoning-model", "s", "u", "fill_issue", {},
      expect.objectContaining({
        maxTokens: 2_048, reasoning: "low", timeoutMs: 20_000,
        record: expect.objectContaining({ feature: "smart_fill", ...context }),
      }),
    );
    expect(answers?.priority?.value).toBe("high");
    expect(answers?.effort?.value).toBe("m");
    expect(answers?.category_ids?.value).toEqual(["cat-a"]);
  });

  it("keeps a failed generation non-fatal without retrying", async () => {
    forcedToolCallMock.mockResolvedValue(null);
    expect(await runLlmDecision(SPEC, { runId: "fill-run", billTo: { userId: "creator" } })).toBeNull();
    expect(forcedToolCallMock).toHaveBeenCalledTimes(1);
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
