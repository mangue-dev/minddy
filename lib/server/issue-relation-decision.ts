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

/**
 * What the engines may answer. `same_area` gives "same topic, but not linked"
 * a name of its own (MIN-775): without it, two issues of one feature area read
 * as "related" to an engine that has nowhere else to put them. It is stored
 * and applied as "none".
 */
export const RELATION_ANSWERS = ["none", "same_area", "related", "blocks", "blocked_by"] as const;
type RelationAnswer = (typeof RELATION_ANSWERS)[number];

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
export const RELATED_CONFIDENCE_FLOOR = 0.8;
export const DEPENDENCY_CONFIDENCE_FLOOR = 0.9;

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
      value: "same_area",
      label: "Same area only",
      description: `${reference} touches the same feature, screen, component or topic, but it is separate work: nobody needs one to work on the other.`,
    },
    {
      value: "related",
      label: "Related",
      description: `The new issue and ${reference} are obviously about the same specific bug, change or decision: one names the other, or one fixes, reverts or follows up exactly what the other delivered, and whoever works on one must read the other.`,
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
An issue was just written or edited. A similarity search found a few existing issues of the same project. Similarity is NOT evidence: issues of one project naturally share vocabulary, features and screens. For each candidate, decide whether a teammate would obviously link it to the new issue by hand, then call classify_relations once.

Rules:
- You MUST call classify_relations and answer EVERY candidate. Never reply in plain text.
- You are not expected to find a relation. Most candidates have none, and answering "none" or "same_area" for every candidate is a normal, good outcome. A wrong link costs the team more than a missing one.
- "none": different work, one could be a duplicate of the other, or the texts do not give enough evidence.
- "same_area": both issues touch the same feature, product area, screen, component or topic, but they are separate pieces of work. Sharing a feature name (for example both mention the same module) is "same_area", not "related".
- "related" only when the link is obvious from the texts: both are about the same specific bug, change or decision, one explicitly names the other, or the new issue fixes, reverts or follows up exactly what the candidate delivered. If you need to argue for the link, it is not obvious: answer "same_area" or "none".
- The issue that introduced or broadened a feature is "same_area" for later work on that feature, unless the new issue is about exactly the part that issue delivered. Every issue about a feature builds on the one that created it; that alone is not a relation.
- A candidate that is already done is "related" only when the new issue is a direct follow-up, regression or reversal of exactly that work.
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
      enum: [...RELATION_ANSWERS],
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

function isAnswer(value: unknown): value is RelationAnswer {
  return typeof value === "string" && (RELATION_ANSWERS as readonly string[]).includes(value);
}

/**
 * Answers → one verdict per candidate id, or no entry when the engine said
 * nothing usable. "same_area" and a model answer under its verdict's floor
 * become "none": the engine was consulted and did not affirm, which is cached
 * as an abstention rather than re-asked on unchanged content. Pure.
 */
export function relationVerdicts(
  answers: DecisionAnswers,
  candidates: RelationCandidate[],
): Map<string, RelationVerdict> {
  const verdicts = new Map<string, RelationVerdict>();
  candidates.slice(0, MAX_RELATION_CANDIDATES).forEach((candidate, i) => {
    const answer = answers[relationQuestionKey(i)];
    if (!answer || !isAnswer(answer.value)) return;
    if (answer.value === "same_area") {
      verdicts.set(candidate.id, "none");
      return;
    }
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
