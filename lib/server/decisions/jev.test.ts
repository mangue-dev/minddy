import { describe, expect, it } from "vitest";

import { decisionsUrl, expandJevQuestions, parseJevAnswers } from "./jev";
import type { DecisionSpec } from "./types";

/**
 * The pure half of the Jev adapter. The engine is never trusted blindly:
 * every answer is checked against the spec's real values, and ANY deviation
 * (a missing answer, an unknown value, a malformed envelope) is an error the
 * runner reads as "Jev unavailable" — never a value the caller could write.
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
        { value: "high", label: "high" },
        { value: "low", label: "low" },
      ],
    },
    {
      key: "category_ids",
      kind: "multi_choice",
      label: "categories",
      options: [
        { value: "cat-a", label: "A" },
        { value: "cat-b", label: "B" },
        { value: "cat-c", label: "C" },
      ],
      maxSelections: 2,
    },
    { key: "is_junk", kind: "boolean", label: "junk?" },
    {
      key: "effort",
      kind: "score",
      label: "effort",
      levels: [
        { value: 1, label: "xs" },
        { value: 2, label: "s" },
        { value: 3, label: "m" },
      ],
    },
  ],
  llm: { toolName: "fill_issue", parameters: {}, systemPrompt: "s", userMessage: "u" },
};

describe("decisionsUrl", () => {
  it("targets the decisions endpoint on the base URL's origin", () => {
    expect(decisionsUrl("https://openrouter.ai/api/v1")).toBe(
      "https://openrouter.ai/api/alpha/decisions"
    );
  });
});

describe("expandJevQuestions", () => {
  it("maps a single choice to a choice with the options as criteria", () => {
    const questions = expandJevQuestions(SPEC);
    expect(questions.priority).toEqual({
      type: "choice",
      criteria: { high: "high", low: "low" },
      instructions: "priority",
    });
  });

  it("spreads a multi choice into one noul per option, prefixed by the key", () => {
    const questions = expandJevQuestions(SPEC);
    expect(questions["category_ids:cat-a"]).toEqual({
      type: "noul",
      instructions: "A",
    });
    expect(questions["category_ids:cat-b"]).toEqual({
      type: "noul",
      instructions: "B",
    });
    expect(questions["category_ids:cat-c"]).toEqual({
      type: "noul",
      instructions: "C",
    });
    expect(questions.category_ids).toBeUndefined();
  });

  it("maps a boolean to noul and a score to its ordered criteria", () => {
    const questions = expandJevQuestions(SPEC);
    expect(questions.is_junk).toEqual({ type: "noul", instructions: "junk?" });
    expect(questions.effort).toEqual({
      type: "score",
      criteria: [
        { value: 1, label: "xs" },
        { value: 2, label: "s" },
        { value: 3, label: "m" },
      ],
      instructions: "effort",
    });
  });
});

describe("parseJevAnswers", () => {
  it("parses a complete, well-formed response", () => {
    const parsed = parseJevAnswers(SPEC, {
      answers: {
        priority: { choice: "high", probabilities: { high: 0.9, low: 0.1 }, confidence: 0.87 },
        "category_ids:cat-a": { noul: 0.92 },
        "category_ids:cat-b": { noul: 0.05 },
        "category_ids:cat-c": { noul: 0.81 },
        is_junk: 0.02,
        effort: { score: 2, confidence: 0.7, probabilities: { 2: 0.6 } },
      },
    });
    expect(parsed).toEqual({
      answers: {
        priority: { value: "high", probability: 0.9, confidence: 0.87 },
        // cat-c (0.81) selected, cat-b (0.05) not; the weakest verdict —
        // a confident no at 0.95 — does not win, the 0.81 yes does.
        category_ids: { value: ["cat-a", "cat-c"], probability: 0.92, confidence: 0.81 },
        is_junk: { value: false, probability: 0.02, confidence: 0.98 },
        effort: { value: 2, probability: 0.6, confidence: 0.7 },
      },
    });
  });

  it("caps the multi selection at the spec's cardinality, most probable first", () => {
    const parsed = parseJevAnswers(SPEC, {
      answers: {
        priority: { choice: "low" },
        "category_ids:cat-a": 0.6,
        "category_ids:cat-b": 0.95,
        "category_ids:cat-c": 0.7,
        is_junk: 0.1,
        effort: 3,
      },
    });
    expect("error" in parsed).toBe(false);
    if ("answers" in parsed) {
      expect(parsed.answers.category_ids?.value).toEqual(["cat-b", "cat-c"]);
    }
  });

  it("treats a 0.5 noul as yes, and a borderline no as low confidence", () => {
    const parsed = parseJevAnswers(SPEC, {
      answers: {
        priority: "high",
        "category_ids:cat-a": 0.5,
        "category_ids:cat-b": 0.5,
        "category_ids:cat-c": 0.5,
        is_junk: 0.5,
        effort: 1,
      },
    });
    if ("answers" in parsed) {
      expect(parsed.answers.is_junk?.value).toBe(true);
      expect(parsed.answers.is_junk?.confidence).toBe(0.5);
      expect(parsed.answers.category_ids?.value).toEqual(["cat-a", "cat-b"]);
    }
  });

  it("accepts the answers under the `questions` key when `answers` is absent", () => {
    const parsed = parseJevAnswers(SPEC, {
      questions: {
        priority: { choice: "low" },
        "category_ids:cat-a": 0.9,
        "category_ids:cat-b": 0.1,
        "category_ids:cat-c": 0.1,
        is_junk: 0.1,
        effort: 1,
      },
    });
    expect("answers" in parsed).toBe(true);
  });

  it("refuses a choice value outside the spec's options", () => {
    const parsed = parseJevAnswers(SPEC, {
      answers: {
        priority: { choice: "urgent" },
        "category_ids:cat-a": 0.9,
        "category_ids:cat-b": 0.1,
        "category_ids:cat-c": 0.1,
        is_junk: 0.1,
        effort: 1,
      },
    });
    expect(parsed).toMatchObject({ error: expect.stringContaining("priority") });
  });

  it("refuses a score value outside the level list", () => {
    const parsed = parseJevAnswers(SPEC, {
      answers: {
        priority: { choice: "low" },
        "category_ids:cat-a": 0.9,
        "category_ids:cat-b": 0.1,
        "category_ids:cat-c": 0.1,
        is_junk: 0.1,
        effort: 99,
      },
    });
    expect(parsed).toMatchObject({ error: expect.stringContaining("effort") });
  });

  it("resolves the current score shape through its legend and distribution", () => {
    // The drifted decisions API answers a 0–1 grade, not the level value:
    // the chosen level is the argmax index, mapped back by the legend.
    const parsed = parseJevAnswers(SPEC, {
      answers: {
        priority: { choice: "low" },
        "category_ids:cat-a": 0.9,
        "category_ids:cat-b": 0.1,
        "category_ids:cat-c": 0.1,
        is_junk: 0.1,
        effort: {
          type: "score",
          score: 0.86,
          legend: {
            0: { value: 1, label: "xs" },
            1: { value: 2, label: "s" },
            2: { value: 3, label: "m" },
          },
          probabilities: { 0: 0.04, 1: 0.1, 2: 0.86 },
          confidence: 0.71,
        },
      },
    });
    expect("error" in parsed).toBe(false);
    if ("answers" in parsed) {
      expect(parsed.answers.effort).toEqual({
        value: 3,
        probability: 0.86,
        confidence: 0.71,
      });
    }
  });

  it("refuses a current-shape score whose legend carries an unknown value", () => {
    const parsed = parseJevAnswers(SPEC, {
      answers: {
        priority: { choice: "low" },
        "category_ids:cat-a": 0.9,
        "category_ids:cat-b": 0.1,
        "category_ids:cat-c": 0.1,
        is_junk: 0.1,
        effort: {
          type: "score",
          score: 0.9,
          legend: { 0: { value: 1, label: "xs" }, 1: { value: 99, label: "xxl" } },
          probabilities: { 0: 0.1, 1: 0.9 },
          confidence: 0.9,
        },
      },
    });
    expect(parsed).toMatchObject({ error: expect.stringContaining("effort") });
  });

  it("refuses a response with a missing answer — every question must be answered", () => {
    const parsed = parseJevAnswers(SPEC, {
      answers: {
        priority: { choice: "low" },
        "category_ids:cat-a": 0.9,
        // cat-b and cat-c missing
        is_junk: 0.1,
        effort: 1,
      },
    });
    expect(parsed).toMatchObject({ error: expect.stringContaining("category_ids") });
  });

  it("refuses a response without a parsable answers object, naming the shape", () => {
    const parsed = parseJevAnswers(SPEC, { hello: "world" });
    expect(parsed).toMatchObject({ error: expect.stringContaining("hello") });
    expect(parseJevAnswers(SPEC, null)).toMatchObject({ error: expect.any(String) });
    expect(parseJevAnswers(SPEC, [1, 2])).toMatchObject({ error: expect.any(String) });
  });

  it("reads a missing choice confidence as unconfident, not as trustworthy", () => {
    const parsed = parseJevAnswers(SPEC, {
      answers: {
        priority: { choice: "low" },
        "category_ids:cat-a": 0.9,
        "category_ids:cat-b": 0.1,
        "category_ids:cat-c": 0.1,
        is_junk: 0.1,
        effort: 1,
      },
    });
    if ("answers" in parsed) {
      // The runner's floor check must see 0, not a fabricated 1.
      expect(parsed.answers.priority?.confidence).toBe(0);
    }
  });
});
