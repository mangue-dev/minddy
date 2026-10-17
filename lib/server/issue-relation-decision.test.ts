import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { validateDecisionSpec } from "@/lib/server/decisions/types";
import { mapLlmAnswers } from "@/lib/server/decisions/llm";
import {
  buildRelationSpec,
  invertVerdict,
  MAX_RELATION_CANDIDATES,
  relationVerdicts,
  type RelationCandidate,
} from "./issue-relation-decision";

const candidates: RelationCandidate[] = Array.from({ length: 7 }, (_, i) => ({
  id: `00000000-0000-4000-8000-00000000000${i}`,
  reference: `#${i + 10}`,
  title: `Candidate ${i}`,
  description: i === 0 ? "x".repeat(5_000) : null,
  status: "todo",
}));

const subject = { title: "Add SSO login", description: "Use the new auth provider." };

describe("buildRelationSpec", () => {
  it("builds a valid spec with one bounded question per candidate", () => {
    const spec = buildRelationSpec({ projectName: "Minddy", subject, candidates });
    expect(validateDecisionSpec(spec)).toBe(true);
    expect(spec.useCase).toBe("issue_relations");
    expect(spec.questions).toHaveLength(MAX_RELATION_CANDIDATES);
    // Option values never carry the multi-choice separator, and ids never reach the engines as keys.
    expect(spec.questions.map((q) => q.key)).toEqual([
      "candidate_1", "candidate_2", "candidate_3", "candidate_4", "candidate_5",
    ]);
    expect(JSON.stringify(spec.questions)).not.toContain(candidates[0].id);
    // Candidate descriptions are truncated before reaching any engine.
    expect(spec.llm.userMessage.length).toBeLessThan(5_000);
    expect(spec.llm.parameters).toMatchObject({
      required: ["candidate_1", "candidate_2", "candidate_3", "candidate_4", "candidate_5"],
    });
  });
});

describe("relationVerdicts", () => {
  const five = candidates.slice(0, 3);

  it("keeps LLM verdicts (no confidence) as the engine stated them", () => {
    const spec = buildRelationSpec({ projectName: "Minddy", subject, candidates: five });
    const answers = mapLlmAnswers(spec, {
      candidate_1: "blocks",
      candidate_2: "related",
      candidate_3: "invented",
    });
    const verdicts = relationVerdicts(answers, five);
    expect(verdicts.get(five[0].id)).toBe("blocks");
    expect(verdicts.get(five[1].id)).toBe("related");
    // An invalid value is silence, not a verdict.
    expect(verdicts.has(five[2].id)).toBe(false);
  });

  it("downgrades a decision-model dependency under its stricter floor to an abstention", () => {
    const verdicts = relationVerdicts(
      {
        candidate_1: { value: "blocked_by", probability: 0.9, confidence: 0.7 },
        candidate_2: { value: "related", probability: 0.9, confidence: 0.7 },
        candidate_3: { value: "blocks", probability: 0.95, confidence: 0.92 },
      },
      five,
    );
    expect(verdicts.get(five[0].id)).toBe("none");
    expect(verdicts.get(five[1].id)).toBe("related");
    expect(verdicts.get(five[2].id)).toBe("blocks");
  });
});

describe("invertVerdict", () => {
  it("reads a cached verdict from the other issue's side", () => {
    expect(invertVerdict("blocks")).toBe("blocked_by");
    expect(invertVerdict("blocked_by")).toBe("blocks");
    expect(invertVerdict("related")).toBe("related");
    expect(invertVerdict("none")).toBe("none");
  });
});
