/**
 * Pure builders of the decision layer (MIN-562): each use case assembles its
 * `DecisionSpec` here — the dense structured state (System One style) plus
 * the typed questions — from data the caller already holds.
 *
 * Nothing in this module touches the base or the network: the caller fetches
 * (categories, members, kNN candidates…), the builder arranges. The option
 * values are ALWAYS real ids or real enum values — the engines may pick a
 * wrong one, they can never invent one — and the lists are capped to the
 * same ceilings the LLM prompts use, so both engines see the same world.
 */

import "server-only";

import {
  ISSUE_EFFORTS,
  ISSUE_PRIORITIES,
} from "@/lib/issue-validation";
import type { FeedbackSensitivityKind } from "@/lib/feedback/types";
import { FEEDBACK_SENSITIVITY_KINDS } from "@/lib/feedback/types";
import type { FeedbackTranslationSettings } from "@/lib/feedback/translation-policy";
import {
  buildFeedbackReviewPrompt,
  FEEDBACK_REVIEW_BODY_TRUNCATE,
  type FeedbackReviewPromptCandidate,
} from "@/lib/feedback/review-prompt";
import {
  buildSmartFillPrompt,
  buildSmartFillUserMessage,
  fillParameters,
  MAX_CATEGORIES_PER_ISSUE,
  MAX_CONTEXT_ITEMS,
  MAX_DESCRIPTION_CHARS,
  MAX_TITLE_CHARS,
  SMART_FILL_NONE,
  type SmartFillContext,
} from "@/lib/server/smart-fill";
import {
  buildSmartAssignMemberLines,
  buildSmartAssignSystemPrompt,
  buildSmartAssignUserMessage,
  smartAssignParameters,
  type SmartAssignMember,
} from "@/lib/server/smart-assign";
import type { DecisionOption, DecisionQuestion, DecisionSpec } from "@/lib/server/decisions/types";

/**
 * MODULE-LEVEL RULE — the reason `NO_OBJECTIVE`/`NO_EFFORT` below are built
 * INLINE instead of as module constants.
 *
 * The LLM recipes live in the use-case modules (`smart-fill.ts`,
 * `smart-assign.ts`), the spec builders live here, so the imports are mutual.
 * A module-level binding of THIS file that reads a use-case module's export
 * (e.g. `SMART_FILL_NONE`) evaluates while that module is still initializing:
 * a TDZ crash at import time in production bundles — the Next build dies on
 * it during page-data collection — that vitest never reproduces (Vite's SSR
 * transform resolves the cycle differently). Everything of the other side is
 * therefore read lazily, inside the builders' function bodies.
 */

function choiceOptions(entries: { value: string; label: string }[]): DecisionOption[] {
  return entries.map((e) => ({ value: e.value, label: e.label }));
}

function truncate(text: string | null | undefined, max: number): string | null {
  const trimmed = text?.trim() || null;
  return trimmed ? trimmed.slice(0, max) : null;
}

/**
 * SMART FILL — what a new ticket IS, deduced from its title and description.
 *
 * The state is the same world the LLM prompt paints (project name, issue,
 * categories, open objectives) in structured form; the questions are the
 * four fields of `fill_issue`, keyed exactly like the tool arguments so the
 * answers feed `sanitizeSmartFill` whichever engine produced them.
 */
export function buildSmartFillSpec(input: {
  projectName: string;
  title: string;
  description: string | null;
  ctx: SmartFillContext;
}): DecisionSpec {
  const { projectName, title, description, ctx } = input;
  const questions: DecisionQuestion[] = [
    {
      key: "priority",
      kind: "single_choice",
      label: "How urgent does this issue read?",
      options: choiceOptions(ISSUE_PRIORITIES.map((p) => ({ value: p, label: p }))),
    },
    {
      key: "effort",
      kind: "single_choice",
      label: "What is the t-shirt size of the work described?",
      options: [
        ...choiceOptions(ISSUE_EFFORTS.map((e) => ({ value: e, label: e }))),
        {
          value: SMART_FILL_NONE,
          label: "Nothing estimable",
          description: "The text describes nothing sizable — a question, a note.",
        },
      ],
    },
  ];
  // A question with no option teaches nothing and fails the spec validation
  // (`validateDecisionSpec` refuses an empty choice): with no category to
  // classify into, the question is simply not asked — the patch carries no
  // category field, exactly like an LLM answering an empty array. The other
  // three questions always have an option (the enums, the "none" sentinels).
  if (ctx.categories.length > 0) {
    questions.push({
      key: "category_ids",
      kind: "multi_choice",
      label: "Which of this project's categories does the issue belong to?",
      options: choiceOptions(
        ctx.categories.slice(0, MAX_CONTEXT_ITEMS).map((c) => ({ value: c.id, label: c.name }))
      ),
      maxSelections: MAX_CATEGORIES_PER_ISSUE,
    });
  }
  questions.push({
    key: "objective_id",
    kind: "single_choice",
    label: "Which objective does the issue plainly belong to?",
    options: [
      ...choiceOptions(
        ctx.objectives.slice(0, MAX_CONTEXT_ITEMS).map((o) => ({ value: o.id, label: o.name }))
      ),
      {
        value: SMART_FILL_NONE,
        label: "No objective",
        description: "No objective of this project fits this issue.",
      },
    ],
  });
  return {
    useCase: "smart_fill",
    state: {
      project: projectName,
      issue: {
        title: truncate(title, MAX_TITLE_CHARS),
        description: truncate(description, MAX_DESCRIPTION_CHARS),
      },
      categories: ctx.categories.slice(0, MAX_CONTEXT_ITEMS),
      objectives: ctx.objectives.slice(0, MAX_CONTEXT_ITEMS),
    },
    questions,
    // The existing pass, verbatim: prompts and tool schema unchanged (MIN-562).
    llm: {
      toolName: "fill_issue",
      parameters: fillParameters(ctx),
      systemPrompt: buildSmartFillPrompt(projectName, ctx),
      userMessage: buildSmartFillUserMessage(title, description),
    },
  };
}

/**
 * SMART ASSIGN — who takes the ticket.
 *
 * The members arrive with their names already resolved and their owner mark
 * and rule attached (`SmartAssignMember`); the question offers exactly the
 * real member ids, like the `choose_assignee` enum does today.
 */
export function buildSmartAssignSpec(input: {
  projectName: string;
  issue: {
    title: string;
    description: string | null;
    /** Category names of the issue, comma-joined, or an empty string. */
    categories: string;
    priority: string | null;
    effort: string | null;
  };
  members: SmartAssignMember[];
}): DecisionSpec {
  const { projectName, issue, members } = input;
  return {
    useCase: "smart_assign",
    state: {
      project: projectName,
      issue: {
        title: truncate(issue.title, MAX_TITLE_CHARS),
        description: truncate(issue.description, MAX_DESCRIPTION_CHARS),
        categories: issue.categories,
        priority: issue.priority,
        effort: issue.effort,
      },
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        owner: m.owner,
        rule: m.rule?.trim() || null,
      })),
    },
    questions: [
      {
        key: "user_id",
        kind: "single_choice",
        label: "Which team member is best suited to handle this issue?",
        options: choiceOptions(members.map((m) => ({ value: m.id, label: m.name }))),
      },
    ],
    llm: {
      toolName: "choose_assignee",
      parameters: smartAssignParameters(members.map((m) => m.id)),
      systemPrompt: buildSmartAssignSystemPrompt(projectName),
      userMessage: buildSmartAssignUserMessage(issue, buildSmartAssignMemberLines(members)),
    },
  };
}

/**
 * FEEDBACK AI REVIEW — what happens to a submitted post.
 *
 * The moderation verdicts (`is_junk`, `is_sensitive` + its kind), the
 * categories and the duplicate verdict are decisions; the language and the
 * translation are NOT part of the spec — they stay on the LLM pass
 * (MIN-565), which is why the LLM recipe here is the full existing schema
 * while the questions carry only the decisions.
 *
 * `duplicate_of` and `category_ids` are only asked when there is something
 * to compare against / classify into — a question whose only option is
 * "none" teaches the engines nothing.
 */
export function buildFeedbackReviewSpec(input: {
  post: { title: string; body: string };
  candidates: FeedbackReviewPromptCandidate[];
  categories: { id: string; name: string }[];
  translation: FeedbackTranslationSettings;
}): DecisionSpec {
  const { post, candidates, categories, translation } = input;
  const sensitivityOptions: DecisionOption[] = [
    ...choiceOptions(
      FEEDBACK_SENSITIVITY_KINDS.map((k: FeedbackSensitivityKind) => ({ value: k, label: k }))
    ),
    { value: SMART_FILL_NONE, label: "Not sensitive" },
  ];
  const questions: DecisionQuestion[] = [
    {
      key: "is_junk",
      kind: "boolean",
      label: "Is this post spam, gibberish, an empty test, an ad, or abuse with no real product signal?",
    },
    {
      key: "is_sensitive",
      kind: "boolean",
      label: "Could publishing this post publicly cause harm (security, personal data, legal)?",
    },
    {
      key: "sensitivity_kind",
      kind: "single_choice",
      label: "What kind of sensitivity applies, if the post is sensitive?",
      options: sensitivityOptions,
    },
  ];
  if (candidates.length > 0) {
    questions.push({
      key: "duplicate_of",
      kind: "single_choice",
      label: "Which candidate post expresses the SAME underlying need as this post?",
      options: [
        ...choiceOptions(candidates.map((c) => ({ value: c.id, label: c.title }))),
        { value: SMART_FILL_NONE, label: "No duplicate" },
      ],
    });
  }
  if (categories.length > 0) {
    questions.push({
      key: "category_ids",
      kind: "multi_choice",
      label: "Which of the project's categories does the post fit?",
      options: choiceOptions(categories.map((c) => ({ value: c.id, label: c.name }))),
      maxSelections: Math.min(categories.length, MAX_CONTEXT_ITEMS),
    });
  }
  return {
    useCase: "feedback_review",
    state: {
      post: {
        title: post.title,
        body: truncate(post.body, FEEDBACK_REVIEW_BODY_TRUNCATE),
      },
      candidates: candidates.map((c) => ({
        id: c.id,
        title: c.title,
        body: truncate(c.body, FEEDBACK_REVIEW_BODY_TRUNCATE),
        similarity: c.similarity,
      })),
      categories,
    },
    questions,
    llm: {
      toolName: "review_feedback",
      ...buildFeedbackReviewPrompt({ post, candidates, categories, translation }),
    },
  };
}
