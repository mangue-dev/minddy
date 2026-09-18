import { describe, expect, it } from "vitest";

import {
  decisionConfidence,
  optionValues,
  validateDecisionSpec,
  type DecisionSpec,
} from "./types";

/**
 * The contract tests: a spec that fails structural validation must NEVER
 * reach an engine (the runner degrades instead), and the global confidence
 * must read as "the weakest link" — that is the number the floor check
 * decides on.
 */

function baseSpec(overrides: Partial<DecisionSpec> = {}): DecisionSpec {
  return {
    useCase: "smart_fill",
    state: { project: "p", issue: { title: "t" } },
    questions: [
      {
        key: "priority",
        kind: "single_choice",
        label: "priority",
        options: [
          { value: "high", label: "high" },
          { value: "low", label: "low" },
        ],
      },
    ],
    llm: { toolName: "fill_issue", parameters: {}, systemPrompt: "s", userMessage: "u" },
    ...overrides,
  };
}

describe("validateDecisionSpec", () => {
  it("accepts a well-formed spec", () => {
    expect(validateDecisionSpec(baseSpec())).toBe(true);
  });

  it("refuses an empty state — Jev answers confidently on no information", () => {
    expect(validateDecisionSpec(baseSpec({ state: {} }))).toBe(false);
    expect(validateDecisionSpec(baseSpec({ state: undefined as never }))).toBe(false);
  });

  it("refuses a spec without questions", () => {
    expect(validateDecisionSpec(baseSpec({ questions: [] }))).toBe(false);
  });

  it("refuses duplicate question keys", () => {
    const spec = baseSpec({
      questions: [
        ...baseSpec().questions,
        { key: "priority", kind: "boolean", label: "again" },
      ],
    });
    expect(validateDecisionSpec(spec)).toBe(false);
  });

  it("refuses a single choice without options", () => {
    expect(
      validateDecisionSpec(
        baseSpec({
          questions: [{ key: "q", kind: "single_choice", label: "q", options: [] }],
        })
      )
    ).toBe(false);
  });

  it("refuses option lists beyond the API cardinality of 255", () => {
    const options = Array.from({ length: 256 }, (_, i) => ({ value: `v${i}`, label: `v${i}` }));
    expect(
      validateDecisionSpec(
        baseSpec({ questions: [{ key: "q", kind: "single_choice", label: "q", options }] })
      )
    ).toBe(false);
  });

  it("refuses a multi choice whose maxSelections exceeds its options", () => {
    expect(
      validateDecisionSpec(
        baseSpec({
          questions: [
            {
              key: "q",
              kind: "multi_choice",
              label: "q",
              options: [{ value: "a", label: "a" }],
              maxSelections: 2,
            },
          ],
        })
      )
    ).toBe(false);
  });

  it("refuses a score with fewer than two levels", () => {
    expect(
      validateDecisionSpec(
        baseSpec({
          questions: [{ key: "q", kind: "score", label: "q", levels: [{ value: 1, label: "one" }] }],
        })
      )
    ).toBe(false);
  });

  it("refuses option values carrying the multi-choice wire separator", () => {
    expect(
      validateDecisionSpec(
        baseSpec({
          questions: [
            {
              key: "q",
              kind: "single_choice",
              label: "q",
              options: [{ value: "a:b", label: "a" }],
            },
          ],
        })
      )
    ).toBe(false);
  });
});

describe("decisionConfidence", () => {
  it("is the weakest per-question confidence", () => {
    const confidence = decisionConfidence(baseSpec(), {
      priority: { value: "high", probability: 0.9, confidence: 0.6 },
    });
    expect(confidence).toBe(0.6);
  });

  it("falls back to the answer's probability when no confidence is given", () => {
    const confidence = decisionConfidence(baseSpec(), {
      priority: { value: "high", probability: 0.7, confidence: null },
    });
    expect(confidence).toBe(0.7);
  });

  it("skips questions the engine did not answer", () => {
    const confidence = decisionConfidence(baseSpec(), {});
    expect(confidence).toBe(1);
  });

  it("skips answers that carry neither confidence nor probability", () => {
    const confidence = decisionConfidence(baseSpec(), {
      priority: { value: "high", probability: null, confidence: null },
    });
    expect(confidence).toBe(1);
  });
});

describe("optionValues", () => {
  it("lists the allowed values whatever the kind", () => {
    expect(
      optionValues({
        key: "q",
        kind: "score",
        label: "q",
        levels: [
          { value: 1, label: "one" },
          { value: 2, label: "two" },
        ],
      })
    ).toEqual(["1", "2"]);
    expect(optionValues({ key: "q", kind: "boolean", label: "q" })).toEqual([]);
  });
});
