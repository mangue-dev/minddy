import {
  FEEDBACK_SENSITIVITY_KINDS,
} from "@/lib/feedback/types";
import {
  effectiveSkipLanguages,
  type FeedbackTranslationSettings,
} from "@/lib/feedback/translation-policy";

/**
 * Prompt of the feedback AI review pass (MIN-87), extracted PURE from
 * `lib/server/feedback/review.ts` (MIN-562) so the decision layer's LLM
 * fallback (`lib/server/decisions/llm.ts`) replays the exact same strings.
 * No base, no network: build, then hand over.
 *
 * The tool schema covers the WHOLE pass — moderation, dedup, categories and
 * the translation block — because the pass is one forced call. The decision
 * layer maps only the decision answers out of it; the translation fields
 * stay LLM-only by design (MIN-565).
 */

/** Candidate bodies are truncated in the prompt: a long pasted post must not
 * drown the eight candidates it is compared against. */
export const FEEDBACK_REVIEW_BODY_TRUNCATE = 1500;

/** A post to review, as the prompt needs it. */
export interface FeedbackReviewPromptPost {
  title: string;
  body: string;
}

/** A kNN candidate, as `matchFeedbackPosts` returns it (subset). */
export interface FeedbackReviewPromptCandidate {
  id: string;
  title: string;
  body: string;
  similarity: number;
}

export interface FeedbackReviewPromptInput {
  post: FeedbackReviewPromptPost;
  candidates: FeedbackReviewPromptCandidate[];
  categories: { id: string; name: string }[];
  translation: FeedbackTranslationSettings;
}

export interface FeedbackReviewPrompt {
  systemPrompt: string;
  userMessage: string;
  parameters: Record<string, unknown>;
}

export function buildFeedbackReviewPrompt(
  input: FeedbackReviewPromptInput
): FeedbackReviewPrompt {
  const candidateIds = input.candidates.map((c) => c.id);
  const categoryIds = input.categories.map((c) => c.id);
  const hasCandidates = candidateIds.length > 0;
  const hasCategories = categoryIds.length > 0;
  // The “language” block only costs where it serves: a project that cut the
  // traduction ne paie pas de champs qu'il jettera.
  const wantsLanguage = input.translation.enabled;
  const skipList = effectiveSkipLanguages(input.translation);

  const systemPrompt = `You review a post submitted to a product feedback board BEFORE it is published publicly. Call review_feedback exactly once. Never reply in plain text.

Decide, about the ONE new post below:
1. is_junk — true only if the post is spam, gibberish, an empty test, an ad, or abuse with no real product signal. A short but genuine request is NOT junk.
2. is_sensitive — true if publishing the post publicly could cause harm: an exploitable security vulnerability, a severe/data-loss bug, leaked secrets or credentials, personal data (emails, tokens, private identities), or legally sensitive content. Ordinary bug reports and feature requests are NOT sensitive. When sensitive, set sensitivity_kind and give a short reason.
3. Categories — ${
    hasCategories
      ? "pick every category id from the provided list that fits the post (0, 1 or several). Choose only from the list; never invent ids."
      : "the project defines no categories — omit category_ids."
  }
4. Duplicates — ${
    hasCandidates
      ? `always answer duplicate_of and confidence. Set duplicate_of to the candidate post_id that expresses the SAME underlying need as the new post (wording, tone or language may differ), and confidence (0-1) to your certainty that both express that same need. Minor differences in phrasing, wording or execution detail are NOT grounds to keep posts separate — two ways of asking for the same feature are the same need. Set duplicate_of to null only when no candidate shares the need.`
      : "no candidate to compare against — set duplicate_of to null and confidence to 0."
  }

${
  wantsLanguage
    ? `5. language — the ISO 639-1 code (two lowercase letters, no region) of the language the post is written in, judged on the post AS A WHOLE. Borrowed technical words do not change it: a French sentence containing "bug", "dashboard" or "endpoint" is French ("fr"), not English. Judge by the grammar and the ordinary words, not by the jargon. Use "und" if the post is too short or too garbled to tell.
6. translated_title / translated_body — a faithful translation of the post into ${input.translation.teamLanguage}, for the product team to read. Fill them ONLY if the language you reported at step 5 is none of: ${skipList.join(", ")}. Otherwise set both to null. Translate meaning, not word for word; keep product names, code, identifiers and quoted strings exactly as they are. translated_body must be null when the body is empty.
`
    : ""
}
Junk and sensitive are the only two verdicts to be conservative about: flag them only when clearly warranted. Categories and duplicates are routine — answer them decisively.`;

  const candidateBlock = input.candidates
    .map(
      (c) =>
        `- post_id ${c.id} (similarity ${c.similarity.toFixed(2)})\n  Title: ${c.title}\n  Body: ${c.body.slice(0, FEEDBACK_REVIEW_BODY_TRUNCATE) || "(empty)"}`
    )
    .join("\n");
  const categoryBlock = hasCategories
    ? input.categories.map((c) => `- ${c.id} — ${c.name}`).join("\n")
    : "(none)";

  const userMessage = `## New post
Title: ${input.post.title}
Body: ${input.post.body.slice(0, FEEDBACK_REVIEW_BODY_TRUNCATE) || "(empty)"}

## Candidate duplicates
${candidateBlock || "(none)"}

## Available categories
${categoryBlock}`;

  const properties: Record<string, unknown> = {
    is_junk: { type: "boolean" },
    is_sensitive: { type: "boolean" },
    sensitivity_kind: {
      type: ["string", "null"],
      enum: [...FEEDBACK_SENSITIVITY_KINDS, null],
    },
    reason: { type: ["string", "null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  };
  // What is not `required` is simply not answered with a small
  // model: without that it only returns the moderation verdict and any post
  // appears unique. Each expected decision must therefore be required.
  const required = ["is_junk", "is_sensitive"];
  if (hasCandidates) {
    properties.duplicate_of = { type: ["string", "null"], enum: [...candidateIds, null] };
    required.push("duplicate_of", "confidence");
  }
  if (hasCategories) {
    properties.category_ids = { type: "array", items: { type: "string", enum: categoryIds } };
    required.push("category_ids");
  }
  if (wantsLanguage) {
    // `und` (ISO 639-2 “indeterminate”) rather than null: a small model to which
    // we offer null for a factual question and choose it as soon as he hesitates,
    // and everything becomes indeterminate. A code to be given obliges him to decide, and
    // `normalizeLanguage` refusera `und` comme n'importe quoi d'autre hors jeu.
    properties.language = { type: "string" };
    properties.translated_title = { type: ["string", "null"] };
    properties.translated_body = { type: ["string", "null"] };
    required.push("language", "translated_title", "translated_body");
  }

  return {
    systemPrompt,
    userMessage,
    parameters: { type: "object", properties, required },
  };
}
