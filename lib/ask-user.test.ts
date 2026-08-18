import { describe, expect, it } from "vitest";
import {
  parseAskUserQuestions,
  composeAskUserReply,
  matchAskUserAnswers,
  MAX_ASK_USER_QUESTIONS,
} from "./ask-user";

describe("parseAskUserQuestions", () => {
  it("parse la forme actuelle {questions: [{question, header, multi_select, options}]}", () => {
    const parsed = parseAskUserQuestions({
      questions: [
        {
          question: "Quel provider ?",
          header: "Billing",
          options: [
            { label: "Stripe (Recommended)", description: "Déjà intégré côté AutoKap." },
            { label: "Paddle", description: "Merchant of record." },
          ],
        },
        {
          question: "Quelles plateformes cibler ?",
          header: "Cibles",
          multi_select: true,
          options: [{ label: "Web" }, { label: "iOS" }],
        },
      ],
    });
    expect(parsed).toEqual([
      {
        question: "Quel provider ?",
        header: "Billing",
        multiSelect: false,
        options: [
          { label: "Stripe", description: "Déjà intégré côté AutoKap.", recommended: true },
          { label: "Paddle", description: "Merchant of record.", recommended: false },
        ],
      },
      {
        question: "Quelles plateformes cibler ?",
        header: "Cibles",
        multiSelect: true,
        options: [
          { label: "Web", description: "", recommended: false },
          { label: "iOS", description: "", recommended: false },
        ],
      },
    ]);
  });

  it("detects the French (Recommandé) suffix and removes it from the label", () => {
    const [q] = parseAskUserQuestions({
      questions: [
        { question: "Layout ?", options: [{ label: "Paginée (Recommandé)" }] },
      ],
    });
    expect(q.options[0]).toEqual({ label: "Paginée", description: "", recommended: true });
  });

  it("absorbe la forme v1 {questions: [{question, suggestions: string[]}]}", () => {
    expect(
      parseAskUserQuestions({
        questions: [{ question: "On continue ?", suggestions: ["Oui", "Non"] }],
      })
    ).toEqual([
      {
        question: "On continue ?",
        header: "",
        multiSelect: false,
        options: [
          { label: "Oui", description: "", recommended: false },
          { label: "Non", description: "", recommended: false },
        ],
      },
    ]);
  });

  it("absorbe la forme legacy mono-question {question, suggestions}", () => {
    const parsed = parseAskUserQuestions({
      question: "On continue ?",
      suggestions: ["Oui"],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].question).toBe("On continue ?");
    expect(parsed[0].options.map((o) => o.label)).toEqual(["Oui"]);
  });

  it("round-trips its own normalized output (multiSelect, recommended)", () => {
    const first = parseAskUserQuestions({
      questions: [
        {
          question: "Multi ?",
          header: "Set",
          multi_select: true,
          options: [{ label: "A (Recommended)", description: "d" }],
        },
      ],
    });
    expect(parseAskUserQuestions({ questions: first })).toEqual(first);
  });

  it("tolerates bare questions and options (strings)", () => {
    expect(parseAskUserQuestions({ questions: ["Quel scope ?"] })).toEqual([
      { question: "Quel scope ?", header: "", multiSelect: false, options: [] },
    ]);
  });

  it("filters empty and non-string entries", () => {
    const parsed = parseAskUserQuestions({
      questions: [
        { question: "  ", options: [{ label: "a" }] },
        { question: "Ok ?", options: [{ label: " " }, 42, { label: "b" }] },
      ],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].options.map((o) => o.label)).toEqual(["b"]);
  });

  it("plafonne au nombre max de questions", () => {
    const parsed = parseAskUserQuestions({
      questions: ["q1", "q2", "q3", "q4", "q5", "q6"],
    });
    expect(parsed).toHaveLength(MAX_ASK_USER_QUESTIONS);
  });

  it("returns [] for invalid arguments", () => {
    expect(parseAskUserQuestions({})).toEqual([]);
    expect(parseAskUserQuestions({ questions: "oops" })).toEqual([]);
  });
});

describe("matchAskUserAnswers", () => {
  const questions = parseAskUserQuestions({
    questions: [
      { question: "Quel provider ?", options: [{ label: "Stripe" }] },
      { question: "Quelles cibles ?", options: [{ label: "Web" }] },
    ],
  });

  it("re-associates question → answer lines from a multi-question submission", () => {
    expect(
      matchAskUserAnswers(questions, "Quel provider ? → Stripe\nQuelles cibles ? → Web, iOS")
    ).toEqual([
      { question: "Quel provider ?", answer: "Stripe" },
      { question: "Quelles cibles ?", answer: "Web, iOS" },
    ]);
  });

  it("single question → the whole message is the answer", () => {
    const single = parseAskUserQuestions({ question: "On continue ?" });
    expect(matchAskUserAnswers(single, "Oui, vas-y")).toEqual([
      { question: "On continue ?", answer: "Oui, vas-y" },
    ]);
  });

  it("unmatchable answer (skip) → answers null", () => {
    expect(matchAskUserAnswers(questions, "J'ai passé les questions.")).toEqual([
      { question: "Quel provider ?", answer: null },
      { question: "Quelles cibles ?", answer: null },
    ]);
  });

  it("no answer → answers null", () => {
    expect(matchAskUserAnswers(questions, null).every((e) => e.answer === null)).toBe(true);
  });
});

describe("composeAskUserReply", () => {
  it("single question → the answer alone", () => {
    expect(
      composeAskUserReply([{ question: "Quel provider ?", answer: " Stripe " }])
    ).toBe("Stripe");
  });

  it("multiple questions → one question → answer line per question", () => {
    expect(
      composeAskUserReply([
        { question: "Quel provider ?", answer: "Stripe" },
        { question: "Quelles cibles ?", answer: "Web, iOS" },
      ])
    ).toBe("Quel provider ? → Stripe\nQuelles cibles ? → Web, iOS");
  });
});
