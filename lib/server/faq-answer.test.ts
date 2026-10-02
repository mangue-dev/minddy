import { describe, expect, it } from "vitest";

import {
  buildFaqAnswerPrompt,
  extractFaqAnswer,
  isFaqSection,
  MAX_QUESTION_CHARS,
  MIN_QUESTION_CHARS,
  resetFaqDailyBudget,
  sanitizeFaqQuestion,
  withinFaqDailyBudget,
} from "./faq-answer";

describe("isFaqSection", () => {
  it("accepts the three pages that carry a FAQ section", () => {
    expect(isFaqSection("landing")).toBe(true);
    expect(isFaqSection("pricing")).toBe(true);
    expect(isFaqSection("mcp")).toBe(true);
  });

  it("rejects everything else, including non-strings", () => {
    expect(isFaqSection("home")).toBe(false);
    expect(isFaqSection("")).toBe(false);
    expect(isFaqSection(null)).toBe(false);
    expect(isFaqSection(42)).toBe(false);
  });
});

describe("sanitizeFaqQuestion", () => {
  it("trims and collapses whitespace", () => {
    expect(sanitizeFaqQuestion("  Does  minddy\n\twork  with teams?  ")).toBe(
      "Does minddy work with teams?",
    );
  });

  it("rejects a non-string", () => {
    expect(sanitizeFaqQuestion(null)).toBeNull();
    expect(sanitizeFaqQuestion(42)).toBeNull();
    expect(sanitizeFaqQuestion({ q: "hi" })).toBeNull();
  });

  it("rejects a too-short or empty question", () => {
    expect(sanitizeFaqQuestion("")).toBeNull();
    expect(sanitizeFaqQuestion("   ")).toBeNull();
    expect(sanitizeFaqQuestion("hi?")).toBeNull();
  });

  it("accepts a question at the exact minimum length", () => {
    const question = "a".repeat(MIN_QUESTION_CHARS) + "?";
    expect(sanitizeFaqQuestion(question)).toBe(question);
  });

  it("rejects a question beyond the hard bound", () => {
    expect(
      sanitizeFaqQuestion("a".repeat(MAX_QUESTION_CHARS + 1)),
    ).toBeNull();
  });

  it("strips control characters from a paste", () => {
    expect(sanitizeFaqQuestion("Does it wo\u0000rk with teams?")).toBe(
      "Does it work with teams?",
    );
  });
});

describe("buildFaqAnswerPrompt", () => {
  const articles = [
    {
      id: "agents-and-mcp",
      title: "Numo and MCP",
      summary: "Work with Numo and connect external agents.",
      category: "automation",
      audience: "both" as const,
      tags: [],
      lastReviewed: "2026-09-17",
      content: "Numo is minddy's built-in conversation.",
    },
    {
      id: "integrations",
      title: "Integrations and public API",
      summary: "Connect a project to external apps.",
      category: "developer",
      audience: "developer" as const,
      tags: [],
      lastReviewed: "2026-09-13",
      content: "Repository linking gives Numo pull-request context.",
    },
  ];

  const prompt = buildFaqAnswerPrompt({
    section: "pricing",
    items: [
      {
        question: "Can I use my own AI provider key?",
        answer: "Yes. Add an API key and choose which AI features use it.",
      },
    ],
    articles,
    locale: "fr",
  });

  it("names the page and carries its FAQ entries verbatim", () => {
    expect(prompt).toContain('"pricing" page');
    expect(prompt).toContain("Can I use my own AI provider key?");
    expect(prompt).toContain("Yes. Add an API key and choose which AI features use it.");
  });

  it("includes full articles for end-user and both audiences", () => {
    expect(prompt).toContain("## Numo and MCP");
    expect(prompt).toContain("Numo is minddy's built-in conversation.");
  });

  it("reduces developer articles to a topic list", () => {
    expect(prompt).toContain("topic: `integrations`");
    expect(prompt).not.toContain("## Integrations and public API");
  });

  it("instructs the model to answer in the visitor's language", () => {
    expect(prompt).toContain("Answer in this language:");
    expect(prompt).toContain("idiomatic French");
  });

  it("forbids inventing facts", () => {
    expect(prompt).toContain("Never invent prices, limits, dates, or product capabilities.");
  });
});

describe("extractFaqAnswer", () => {
  it("returns the trimmed answer", () => {
    expect(extractFaqAnswer("  Yes.  ")).toBe("Yes.");
  });

  it("fails closed on anything that is not a non-empty string", () => {
    expect(extractFaqAnswer(null)).toBeNull();
    expect(extractFaqAnswer("   ")).toBeNull();
    expect(extractFaqAnswer(42)).toBeNull();
  });

  it("cuts an oversized answer on a whole bound", () => {
    const oversized = "a".repeat(2000);
    const answer = extractFaqAnswer(oversized)!;
    expect(answer.length).toBeLessThan(oversized.length);
    expect(answer.endsWith("…")).toBe(true);
  });
});

describe("withinFaqDailyBudget", () => {
  it("refuses beyond the ceiling, within the same day", () => {
    resetFaqDailyBudget();
    expect(withinFaqDailyBudget(2)).toBe(true);
    expect(withinFaqDailyBudget(2)).toBe(true);
    expect(withinFaqDailyBudget(2)).toBe(false);
  });

  it("is independent of the dictation demo's budget", () => {
    // The two features each carry their own per-instance ceiling.
    resetFaqDailyBudget();
    expect(withinFaqDailyBudget(1)).toBe(true);
    expect(withinFaqDailyBudget(1)).toBe(false);
  });
});
