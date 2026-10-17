import "server-only";

import type {
  DecisionAnswers,
  DecisionQuestion,
  DecisionSpec,
} from "@/lib/server/decisions/types";

/**
 * The relation decision of Smart Fill (MIN-717) — pure: the spec, the LLM
 * recipe and the policy that turns answers into verdicts. Nothing here reads
 * the database or the network; `issue-relation-inference.ts` gathers the
 * candidates and applies what this module accepts.
 *
 * Embeddings only RETRIEVE candidates. Similarity says two issues talk about
 * the same thing; it says nothing about a dependency, let alone its
 * direction. Every verdict is therefore asked of a decision engine that reads
 * both issues, and the policy below keeps only what the engine affirmed with
 * enough confidence. Abstaining is the default answer: "none" costs nothing,
 * a wrong "blocks" misleads a whole team.
 *
 * Kept outside `decisions/prepare.ts` on purpose: that module and the use-case
 * modules import each other, and this use case needs nothing from either.
 */

export const RELATION_VERDICTS = ["none", "related", "blocks", "blocked_by"] as const;
export type RelationVerdict = (typeof RELATION_VERDICTS)[number];

/** Candidates per decision: one call answers all of them. */
export const MAX_RELATION_CANDIDATES = 5;
/** Text budget of the issue being linked and of each candidate. */
export const RELATION_SUBJECT_DESCRIPTION_CHARS = 3_000;
export const RELATION_CANDIDATE_DESCRIPTION_CHARS = 1_200;
export const RELATION_TITLE_CHARS = 300;

/**
 * Confidence floors of the decision MODEL's answers, per verdict. A
 * dependency asserts an order of work and is held to a higher bar than a
 * plain "related". LLM answers carry no confidence: the prompt's own
 * abstention rule is their bar, as for the rest of Smart Fill.
 */
export const RELATED_CONFIDENCE_FLOOR = 0.65;
export const DEPENDENCY_CONFIDENCE_FLOOR = 0.8;

export interface RelationSubject {
  title: string;
  description: string | null;
}

export interface RelationCandidate {
  id: string;
  /** Human reference shown to the engines (`MIN-42`), never used as a key. */
  reference: string;
  title: string;
  description: string | null;
  status: string;
}

function truncate(text: string | null | undefined, max: number): string | null {
  const trimmed = text?.trim() || null;
  return trimmed ? trimmed.slice(0, max) : null;
}

/** Question key of the candidate at `index`. Positional: ids never reach the engines as keys. */
export function relationQuestionKey(index: number): string {
  return `candidate_${index + 1}`;
}

function relationOptions(reference: string) {
  return [
    {
      value: "none",
      label: "No relation",
      description: "Different work, or the texts do not say enough to link them.",
    },
    {
      value: "related",
      label: "Related",
      description: `The new issue and ${reference} concern the same feature, bug or decision, without an order of work.`,
    },
    {
      value: "blocks",
      label: `New issue blocks ${reference}`,
      description: `${reference} cannot be done until the new issue is done, as the texts state or plainly require.`,
    },
    {
      value: "blocked_by",
      label: `New issue is blocked by ${reference}`,
      description: `The new issue cannot be done until ${reference} is done, as the texts state or plainly require.`,
    },
  ];
}

export function buildRelationSystemPrompt(projectName: string): string {
  return `You are Smart-fill, minddy's issue triager for the project "${projectName}".
An issue was just written or edited. A search found a few existing issues that may concern the same work. For each candidate, decide whether it has a relation with the new issue, then call classify_relations once.

Rules:
- You MUST call classify_relations and answer EVERY candidate. Never reply in plain text.
- "none" is the default. Answer "none" when the issues merely share words or a topic, when one could be a duplicate of the other, or when the texts do not give enough evidence.
- "related": both issues concern the same specific feature, bug or decision and someone working on one should see the other.
- "blocks": the new issue must be finished BEFORE the candidate can be done, because the texts say so or the candidate plainly builds on what the new issue delivers.
- "blocked_by": the new issue cannot be done until the candidate is finished, for the same kind of reason.
- Never infer a dependency from similarity alone, and never guess its direction. When unsure between "blocks" and "blocked_by", answer "related" or "none".
- Judge from the issues' text only. Issues may be written in different languages.`;
}

export function buildRelationUserMessage(
  subject: RelationSubject,
  candidates: RelationCandidate[],
): string {
  const lines = candidates.map((c, i) =>
    `### ${relationQuestionKey(i)} — ${c.reference} [${c.status}]\nTitle: ${
      truncate(c.title, RELATION_TITLE_CHARS) ?? ""
    }\nDescription: ${truncate(c.description, RELATION_CANDIDATE_DESCRIPTION_CHARS) ?? "(none)"}`
  );
  return `## New issue\nTitle: ${truncate(subject.title, RELATION_TITLE_CHARS) ?? ""}\nDescription: ${
    truncate(subject.description, RELATION_SUBJECT_DESCRIPTION_CHARS) ?? "(none)"
  }\n\n## Candidates\n${lines.join("\n\n")}`;
}

/** Every candidate is a REQUIRED enum: a small model leaves optional fields unanswered. */
export function relationParameters(candidates: RelationCandidate[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  candidates.forEach((c, i) => {
    properties[relationQuestionKey(i)] = {
      type: "string",
      enum: [...RELATION_VERDICTS],
      description: `Relation of the new issue with ${c.reference}.`,
    };
  });
  return {
    type: "object",
    properties,
    required: candidates.map((_, i) => relationQuestionKey(i)),
  };
}

/** The decision spec: one single-choice question per candidate, same world for both engines. */
export function buildRelationSpec(input: {
  projectName: string;
  subject: RelationSubject;
  candidates: RelationCandidate[];
}): DecisionSpec {
  const candidates = input.candidates.slice(0, MAX_RELATION_CANDIDATES);
  const questions: DecisionQuestion[] = candidates.map((c, i) => ({
    key: relationQuestionKey(i),
    kind: "single_choice",
    label: `What is the relation between the new issue and ${c.reference}?`,
    options: relationOptions(c.reference),
  }));
  return {
    useCase: "issue_relations",
    state: {
      project: input.projectName,
      new_issue: {
        title: truncate(input.subject.title, RELATION_TITLE_CHARS),
        description: truncate(input.subject.description, RELATION_SUBJECT_DESCRIPTION_CHARS),
      },
      candidates: candidates.map((c, i) => ({
        key: relationQuestionKey(i),
        reference: c.reference,
        status: c.status,
        title: truncate(c.title, RELATION_TITLE_CHARS),
        description: truncate(c.description, RELATION_CANDIDATE_DESCRIPTION_CHARS),
      })),
    },
    questions,
    llm: {
      toolName: "classify_relations",
      parameters: relationParameters(candidates),
      systemPrompt: buildRelationSystemPrompt(input.projectName),
      userMessage: buildRelationUserMessage(input.subject, candidates),
    },
  };
}

function isVerdict(value: unknown): value is RelationVerdict {
  return typeof value === "string" && (RELATION_VERDICTS as readonly string[]).includes(value);
}

/**
 * Answers → one verdict per candidate id, or no entry when the engine said
 * nothing usable. A model answer under its verdict's floor becomes "none":
 * the engine was consulted and did not affirm, which is cached as an
 * abstention rather than re-asked on unchanged content. Pure.
 */
export function relationVerdicts(
  answers: DecisionAnswers,
  candidates: RelationCandidate[],
): Map<string, RelationVerdict> {
  const verdicts = new Map<string, RelationVerdict>();
  candidates.slice(0, MAX_RELATION_CANDIDATES).forEach((candidate, i) => {
    const answer = answers[relationQuestionKey(i)];
    if (!answer || !isVerdict(answer.value)) return;
    const verdict = answer.value;
    const confidence = answer.confidence ?? answer.probability;
    const floor = verdict === "related" ? RELATED_CONFIDENCE_FLOOR : DEPENDENCY_CONFIDENCE_FLOOR;
    verdicts.set(
      candidate.id,
      verdict !== "none" && confidence !== null && confidence < floor ? "none" : verdict,
    );
  });
  return verdicts;
}

/** The same verdict read from the candidate's side (cache rows are stored per direction). */
export function invertVerdict(verdict: RelationVerdict): RelationVerdict {
  if (verdict === "blocks") return "blocked_by";
  if (verdict === "blocked_by") return "blocks";
  return verdict;
}
