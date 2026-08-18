import type {
  FeedbackPostSource,
  FeedbackPostStatus,
  FeedbackReviewState,
  FeedbackSensitivityKind,
} from "@/lib/feedback/types";

/**
 * Feedback review policy (MIN-87) — the decision heart of the pass
 * AI, isolated in PURE function to be testable without base or LLM.
 *
 * A single pass decides everything, and the ORDER counts (this is the default that MIN-87
 * corrects: before, deduplication ran before moderation):
 *
 * 1. moderate — a junk goes to `spam` and goes nowhere else. It cannot
 * therefore no longer be merged into a real post, where his voice inflated the
 * counter of the canonical and where he then escaped any moderation;
 * 2. protect — sensitive content (security, personal data, legal) becomes
 * private and is NEVER merged automatically: a report security
 * absorbed by a feature request would disappear from the view of
 * the team. At best a suggestion, which the team decides;
 * 3. categorize — except on a post that merges: the canonical already has
 * already its own categories, those of the tombstone would never be read;
 * 4. duplicate — auto merge above the threshold, suggestion above
 * floor.
 *
 * The AI never downgrades a human decision: it only moves a post
 * from `pending` to `published`, never the other way around, and only classifies a
 * as `spam` * post that no hand has decided yet.
 */

/**
 * What happens to a return that arrives: review it, publish it as is, or
 * retain it. Three outcomes, two project settings.
 *
 * - `review` — the normal case: Numo categorizes, filters and moderates before publication.
 * - `publish` — direct publication, without category or moderation. Either the owner
 * has disarmed the magazine, or his AI budget is exhausted AND he has requested that we
 * switch to this mode rather than blocking the board.
 * - `hold` — the return remains pending: the magazine is armed but cannot
 * run (budget exhausted). Fail-closed: nothing unmoderated will be posted on a public board. The team sees it in “Rewatch” and decides by hand.
 */
export type FeedbackReviewMode = "review" | "publish" | "hold";

export function resolveFeedbackReviewMode(params: {
  /** Armed review: instance kill-switch AND project tuning. */
  reviewEnabled: boolean;
  /** AI budget remaining with the project owner. */
  hasBudget: boolean;
  /** Project setting: publish without review when the budget is exhausted. */
  skipOverBudget: boolean;
}): FeedbackReviewMode {
  if (!params.reviewEnabled) return "publish";
  if (params.hasBudget) return "review";
  return params.skipOverBudget ? "publish" : "hold";
}

/** Model output, already normalized (ids validated, bounds applied). */
export interface FeedbackReviewVerdict {
  /** Id of the post of which this is a duplicate, or null. */
  duplicateOf: string | null;
  /** Certitude du doublon, 0–1. */
  confidence: number;
  /** Project categories retained (ids already validated). */
  categoryIds: string[];
  isJunk: boolean;
  isSensitive: boolean;
  sensitivityKind: FeedbackSensitivityKind | null;
  /** Short pattern, visible team. */
  reason: string | null;
}

/** Status of the post at the time of applying the decision (reread just before writing). */
export interface FeedbackReviewSubject {
  source: FeedbackPostSource;
  isPublic: boolean;
  reviewState: FeedbackReviewState;
  /**
 * Current status. He enters the decision because `spam` actually
 * now part: a return already dismissed - by the team, or by a previous pass
 * - must no longer be merged into a real one, where his voice would inflate
 * the canonical counter.
 */
  status: FeedbackPostStatus;
}

export interface FeedbackReviewDecision {
  reviewState: FeedbackReviewState;
  /** true → set the status `spam` (junk detected, return off the board). */
  markSpam: boolean;
  /** true → force `is_public` to false (anti-leak from the public board). */
  forcePrivate: boolean;
  sensitivity: FeedbackSensitivityKind | null;
  moderationReason: string | null;
  /** Categories to install (complete replacement). Empty = don't touch anything. */
  categoryIds: string[];
  /** Automatic merge to execute, or null. */
  mergeTargetId: string | null;
  /** Merge suggestion to propose to the team, or null. */
  suggestTargetId: string | null;
  suggestConfidence: number | null;
}

export function decideFeedbackReview(params: {
  verdict: FeedbackReviewVerdict;
  post: FeedbackReviewSubject;
  autoThreshold: number;
  suggestFloor: number;
}): FeedbackReviewDecision {
  const { verdict, post, autoThreshold, suggestFloor } = params;

  // The junk verdict only applies to a post still pending: once
  // that the team has published (or rejected) a post, its decision is binding.
  const rejectAsJunk = verdict.isJunk && post.reviewState === "pending";

  const sensitivity = verdict.isSensitive
    ? (verdict.sensitivityKind ?? "other")
    : null;
  /**
 * Sensitive content leaves the public board, regardless of which channel it arrived through.
 *
 * Internal entry was exempt — "the team knows what it's posting."
 * But what it enters is not what it wrote: it's the return from a
 * user, received by email or told over the phone, copied by hand. The
 * personal data and security reports go through this ALSO, and
 * the exemption published them without a net. A post that is already private has nothing to change.
 */
  const forcePrivate = verdict.isSensitive && post.isPublic;

  const reason = verdict.reason?.trim() || null;

  const decision: FeedbackReviewDecision = {
    reviewState: post.reviewState,
    markSpam: rejectAsJunk,
    forcePrivate,
    sensitivity,
    // We only keep a reason when it explains a moderating action —
    // otherwise the “sensitive” badge would be displayed with an off-topic comment.
    moderationReason: rejectAsJunk || verdict.isSensitive ? reason : null,
    categoryIds: [],
    mergeTargetId: null,
    suggestTargetId: null,
    suggestConfidence: null,
  };

  // A junk stops here: no categories, no merger, no suggestion. A return
  // ALREADY classified as spam stops at the same place, and for the same reason — it didn't
  // nothing to do in a real return.
  //
  // His review has indeed passed, so he is leaving the queue
  // like the others, otherwise “To see again” would signal it indefinitely as
  // not having been decided — even though it has just been.
  if (rejectAsJunk || post.status === "spam") {
    if (post.reviewState === "pending") decision.reviewState = "published";
    return decision;
  }

  if (post.reviewState === "pending") decision.reviewState = "published";

  const duplicate =
    verdict.duplicateOf && verdict.confidence >= suggestFloor
      ? verdict.duplicateOf
      : null;
  // Auto merge only if we are sure AND the post is not sensitive:
  // sensitive content remains standing, the team decides.
  const autoMerge =
    duplicate !== null && !verdict.isSensitive && verdict.confidence >= autoThreshold;

  if (autoMerge) {
    decision.mergeTargetId = duplicate;
  } else if (duplicate !== null) {
    decision.suggestTargetId = duplicate;
    decision.suggestConfidence = verdict.confidence;
  }

  // Categorizing a tombstone has no reader: the canonical carries its own.
  if (!autoMerge) decision.categoryIds = verdict.categoryIds;

  return decision;
}
