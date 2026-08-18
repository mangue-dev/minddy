import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getAppConfigValues } from "@/lib/server/app-config";
import { modelConfigKeys, resolveFromValues } from "@/lib/server/model-config";
import {
  embedText,
  matchFeedbackPosts,
  toVectorLiteral,
  type MatchedPost,
} from "@/lib/server/embeddings";
import { mergePosts } from "@/lib/server/feedback/merge";
import { forcedToolCall } from "@/lib/server/feedback/forced-tool-call";
import { ownerHasUsageBudget } from "@/lib/server/usage";
import { setFeedbackPostCategories } from "@/lib/server/feedback/set-post-categories";
import { emitFeedbackFieldChanges } from "@/lib/server/feedback/events";
import {
  decideFeedbackReview,
  resolveFeedbackReviewMode,
  type FeedbackReviewMode,
} from "@/lib/feedback/review-policy";
import { defaultLocale } from "@/i18n/config";
import {
  effectiveSkipLanguages,
  shouldTranslateFeedback,
  type FeedbackTranslationSettings,
} from "@/lib/feedback/translation-policy";
import {
  normalizeLanguage,
  type FeedbackLanguage,
} from "@/lib/feedback/languages";
import {
  FEEDBACK_BODY_MAX,
  FEEDBACK_TITLE_MAX,
  FEEDBACK_SENSITIVITY_KINDS,
  normalizeSensitivityKind,
  type FeedbackPostSource,
  type FeedbackPostStatus,
  type FeedbackReviewState,
} from "@/lib/feedback/types";

/**
 * Feedback review pass (MIN-87) — ONE pass, ONE LLM call per post, which
 * replaces the two separate passes before (MIN-37 deduplication then
 * MIN-54 classification).
 *
 * Why merge them: they were rotating in the wrong order. The merge
 * went first, and a merged post leaves the classification queue (the
 * claim excludes `merged_into_id`) — a junk could therefore be absorbed by a real
 * post, its voice inflating the canonical, and a security report could be
 * merged BEFORE being detected sensitive, so never be reported to
 * the team. A single decision, made in the correct order (moderate → protect →
 * categorize → deduplicate), removes the window — and halves the cost.
 *
 * Two triggers share the same core:
 * - `reviewFeedbackPost(id)` — at the submission, via `after()`: a return
 * appears on the board in a few seconds instead of waiting for the cron;
 * - `runFeedbackReview()` — the hourly cron, safety net for posts
 * whose immediate review has failed (LLM down, budget returned since).
 *
 * Competition: claim `for update skip locked` + 15 min lease
 * (self-healing if a run crashes); 3 failures → abandoned, the post remains in
 * waiting and goes back to the team's “To be reviewed” filter (fail-closed
 * assumed: nothing unmoderated is posted on a public board).
 */

const DEFAULT_AUTO_THRESHOLD = 0.92;
const DEFAULT_SUGGEST_FLOOR = 0.6;
const DEFAULT_BATCH_SIZE = 50;
const KNN_CANDIDATES = 8;
const MIN_CANDIDATE_SIMILARITY = 0.5;
const BODY_TRUNCATE = 1500;

interface ClaimedPost {
  id: string;
  project_id: string;
  submitted_title: string;
  submitted_body: string;
  is_public: boolean;
  source: FeedbackPostSource;
  review_state: FeedbackReviewState;
  embedding: unknown;
  analyzed_at: string | null;
  classified_at: string | null;
  analysis_failures: number;
}

export interface ReviewReport {
  posts_reviewed: number;
  posts_merged: number;
  posts_suggested: number;
  posts_categorized: number;
  posts_forced_private: number;
  /** Junk classified `spam` by moderation. */
  posts_rejected: number;
  /** Published without review: project which disarmed it, or exhausted budget shift. */
  posts_published_unreviewed: number;
  failures: number;
}

function emptyReport(): ReviewReport {
  return {
    posts_reviewed: 0,
    posts_merged: 0,
    posts_suggested: 0,
    posts_categorized: 0,
    posts_forced_private: 0,
    posts_rejected: 0,
    posts_published_unreviewed: 0,
    failures: 0,
  };
}

interface ReviewSettings {
  enabled: boolean;
  model: string;
  autoThreshold: number;
  suggestFloor: number;
  batchSize: number;
}

async function loadSettings(): Promise<ReviewSettings> {
  const cfg = await getAppConfigValues([
    "feedback_classify_enabled",
    ...modelConfigKeys("feedback_analysis_model"),
    "feedback_merge_auto_threshold",
    "feedback_merge_suggest_floor",
    "feedback_analysis_batch_size",
  ]);
  return {
    // Kill-switch global : n'importe quoi d'autre que "false" reste actif.
    enabled: (cfg["feedback_classify_enabled"] ?? "true").trim() !== "false",
    model: resolveFromValues("feedback_analysis_model", cfg).model,
    autoThreshold: parseFloatOr(cfg["feedback_merge_auto_threshold"], DEFAULT_AUTO_THRESHOLD),
    suggestFloor: parseFloatOr(cfg["feedback_merge_suggest_floor"], DEFAULT_SUGGEST_FLOOR),
    batchSize: Math.max(
      1,
      Math.round(parseFloatOr(cfg["feedback_analysis_batch_size"], DEFAULT_BATCH_SIZE))
    ),
  };
}

/**
 * Project translation settings (`projects` columns, safe defaults).
 *
 * `feedback_team_language` can be NULL — projects before migration, and
 * those created outside the wizard. We then fall back to the default locale of the app
 * rather than cutting the translation: a team that has not adjusted anything reads
 * probably English, and the setting is one click away to say the opposite.
 */
export async function projectTranslationSettings(
  projectId: string
): Promise<FeedbackTranslationSettings> {
  const service = getServiceClient();
  const { data } = await service
    .from("projects")
    .select(
      "feedback_translate_enabled, feedback_team_language, feedback_no_translate_languages"
    )
    .eq("id", projectId)
    .maybeSingle();
  const skip = data?.feedback_no_translate_languages;
  return {
    enabled: (data?.feedback_translate_enabled as boolean | undefined) ?? true,
    teamLanguage:
      normalizeLanguage(data?.feedback_team_language) ??
      (normalizeLanguage(defaultLocale) as FeedbackLanguage),
    skipLanguages: Array.isArray(skip) ? (skip as string[]) : [],
  };
}

/** Project review settings (`projects` columns, safe defaults if absent). */
async function projectReviewSettings(
  projectId: string
): Promise<{ reviewEnabled: boolean; skipOverBudget: boolean }> {
  const service = getServiceClient();
  const { data } = await service
    .from("projects")
    .select("feedback_review_enabled, feedback_review_skip_over_budget")
    .eq("id", projectId)
    .maybeSingle();
  return {
    reviewEnabled: (data?.feedback_review_enabled as boolean | undefined) ?? true,
    skipOverBudget:
      (data?.feedback_review_skip_over_budget as boolean | undefined) ?? false,
  };
}

/**
 * Is the journal equipped for this project? Instance kill-switch AND setting of
 * owner. When it is not, retaining pending posts would have no
 * sense — no one will come to publish them: the creation publishes them immediately
 * (see `createFeedbackPost`).
 */
export async function isFeedbackReviewEnabled(projectId: string): Promise<boolean> {
  if (!(await loadSettings()).enabled) return false;
  return (await projectReviewSettings(projectId)).reviewEnabled;
}

/**
 * What we do with a post to be reviewed, project settings and owner
 * budget included. See `resolveFeedbackReviewMode` for the truth table.
 */
async function reviewModeForProject(projectId: string): Promise<FeedbackReviewMode> {
  const [project, hasBudget] = await Promise.all([
    projectReviewSettings(projectId),
    ownerHasUsageBudget(projectId, "feedback"),
  ]);
  return resolveFeedbackReviewMode({
    reviewEnabled: project.reviewEnabled,
    hasBudget,
    skipOverBudget: project.skipOverBudget,
  });
}

/**
 * Publication without review: the post is published as is, neither categorized nor moderated. On
 * sets the two completion markers so that it does not return to the queue
 * — re-arming the magazine (or recharging its budget) does not trigger a surprise retroactive pass
 * on the entire history.
 */
async function publishWithoutReview(postId: string): Promise<void> {
  const service = getServiceClient();
  const now = new Date().toISOString();
  const { data: fresh } = await service
    .from("feedback_posts")
    .select("review_state")
    .is("deleted_at", null)
    .eq("id", postId)
    .maybeSingle();
  if (!fresh) return;
  const updates: Record<string, unknown> = {
    analyzed_at: now,
    classified_at: now,
    analysis_claimed_at: null,
  };
  // Only a pending post is promoted: a team decision (published / discarded
  // by hand) is authentic, as everywhere else in the magazine.
  if (fresh.review_state === "pending") updates.review_state = "published";
  await service
    .from("feedback_posts")
    .update(updates)
    .is("deleted_at", null)
    .eq("id", postId)
    .is("merged_into_id", null);
}

/** Batch pass (hourly cron): catches up with anything the immediate review missed. */
export async function runFeedbackReview(): Promise<ReviewReport> {
  const report = emptyReport();
  const settings = await loadSettings();
  if (!settings.enabled) return report;

  const service = getServiceClient();
  const { data: claimed, error } = await service.rpc("claim_feedback_posts_for_review", {
    p_limit: settings.batchSize,
  });
  if (error) {
    console.error("[feedback-review] claim failed:", error.message);
    return report;
  }

  // Only one mode resolution per project in the batch (budget + mode settings
  // owner): it's two readings, no need to redo them for each post.
  const modeByProject = new Map<string, FeedbackReviewMode>();

  for (const post of (claimed ?? []) as ClaimedPost[]) {
    let mode = modeByProject.get(post.project_id);
    if (mode === undefined) {
      mode = await reviewModeForProject(post.project_id);
      modeByProject.set(post.project_id, mode);
    }

    if (mode === "hold") continue; // budget exhausted, no switch requested
    if (mode === "publish") {
      // Disarmed review, or exhausted budget with requested switch: we release the
      // post rather than leaving it waiting indefinitely.
      await publishWithoutReview(post.id);
      report.posts_published_unreviewed += 1;
      continue;
    }

    await runOne(post, settings, report);
  }

  return report;
}

/**
 * Review of a single post, triggered just after its submission (`after()`). Set
 * the same lease as the cron so that the two do not step on each other; sort
 * silently if another run has already taken the post or if it is already reviewed.
 */
export async function reviewFeedbackPost(
  postId: string,
  projectId: string
): Promise<ReviewReport> {
  const report = emptyReport();
  const settings = await loadSettings();
  if (!settings.enabled) return report;

  // Mode BEFORE the claim: a post that we are not going to review should not be seen
  // set a lease of 15 min — otherwise the recovery by the cron would be delayed
  // especially after the return of the budget.
  const mode = await reviewModeForProject(projectId);
  if (mode === "hold") return report;
  if (mode === "publish") {
    await publishWithoutReview(postId);
    report.posts_published_unreviewed += 1;
    return report;
  }

  const service = getServiceClient();
  // Same claim as the cron, targeted on a post: no double processing, no recovery
  // from a post already reviewed.
  const { data, error } = await service.rpc("claim_feedback_post_for_review", {
    p_post: postId,
  });
  if (error) {
    console.error("[feedback-review] inline claim failed:", error.message);
    return report;
  }
  const post = ((data ?? []) as ClaimedPost[])[0];
  if (!post) return report;

  await runOne(post, settings, report);
  return report;
}

async function runOne(
  post: ClaimedPost,
  settings: ReviewSettings,
  report: ReviewReport
): Promise<void> {
  try {
    const ok = await reviewOne(post, settings, report);
    if (!ok) {
      report.failures += 1;
      await bumpFailure(post.id, post.analysis_failures);
    }
  } catch (err) {
    console.error("[feedback-review] post failed:", (err as Error).message);
    report.failures += 1;
    await bumpFailure(post.id, post.analysis_failures);
  }
}

function parseFloatOr(value: string | null | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function bumpFailure(id: string, currentFailures: number): Promise<void> {
  // The lease (analysis_claimed_at) remains set: the retry waits for the next run
  // hourly. At 3 failures, the claim no longer selects the line — the post remains
  // on hold and the team sees it in “See You Again”.
  const service = getServiceClient();
  await service
    .from("feedback_posts")
    .update({ analysis_failures: currentFailures + 1 })
    .is("deleted_at", null)
    .eq("id", id);
}

/** Forbidden pairs (undo / rejected suggestions), in both directions. */
async function fetchRejectedPairIds(itemId: string): Promise<Set<string>> {
  const service = getServiceClient();
  const [asDup, asCanonical] = await Promise.all([
    service.from("feedback_merge_rejections").select("canonical_id").eq("dup_id", itemId),
    service.from("feedback_merge_rejections").select("dup_id").eq("canonical_id", itemId),
  ]);
  return new Set([
    ...(asDup.data ?? []).map((r) => r.canonical_id as string),
    ...(asCanonical.data ?? []).map((r) => r.dup_id as string),
  ]);
}

/**
 * Rejects merge candidates classified as spam: absorbing a real return in a
 * post rejected by moderation would bury it behind an invisible tombstone.
 */
async function dropSpamCandidates(candidates: MatchedPost[]): Promise<MatchedPost[]> {
  if (candidates.length === 0) return candidates;
  const service = getServiceClient();
  const { data } = await service
    .from("feedback_posts")
    .select("id")
    .is("deleted_at", null)
    .in("id", candidates.map((c) => c.id))
    .eq("status", "spam");
  const spam = new Set((data ?? []).map((r) => r.id as string));
  return spam.size === 0 ? candidates : candidates.filter((c) => !spam.has(c.id));
}

interface ProjectCategory {
  id: string;
  name: string;
}

async function reviewOne(
  post: ClaimedPost,
  settings: ReviewSettings,
  report: ReviewReport
): Promise<boolean> {
  const service = getServiceClient();

  // ── Context: embedding (backfill if the submission could not
  // calculate), kNN neighbors, project categories ────────────────────────────
  let embedding = post.embedding ? parseEmbedding(post.embedding) : null;
  if (!embedding) {
    embedding = await embedText(
      post.submitted_body
        ? `${post.submitted_title}\n\n${post.submitted_body}`
        : post.submitted_title,
      // Background pass (cron): no trigger, the owner pays (MIN-131).
      { record: { billTo: { projectOwner: post.project_id }, projectId: post.project_id } }
    );
    if (!embedding) return false;
    await service
      .from("feedback_posts")
      .update({ embedding: toVectorLiteral(embedding) })
      .is("deleted_at", null)
      .eq("id", post.id);
  }

  // A post already deduplicated (marker before MIN-87) does not go through the
  // search for duplicates: we would only re-propose a merger that has already been decided.
  const lookForDuplicates = post.analyzed_at === null;

  const [rejectedPairs, catRows, translation] = await Promise.all([
    lookForDuplicates ? fetchRejectedPairIds(post.id) : Promise.resolve(new Set<string>()),
    service.from("categories").select("id, name").eq("project_id", post.project_id),
    projectTranslationSettings(post.project_id),
  ]);

  let candidates: MatchedPost[] = [];
  if (lookForDuplicates) {
    const matched = await matchFeedbackPosts({
      projectId: post.project_id,
      embedding,
      exclude: post.id,
      limit: KNN_CANDIDATES,
    });
    candidates = await dropSpamCandidates(
      matched.filter(
        (c) => c.similarity >= MIN_CANDIDATE_SIMILARITY && !rejectedPairs.has(c.id)
      )
    );
  }

  const categories = ((catRows.data ?? []) as { id: string; name: string }[]).map((c) => ({
    id: c.id,
    name: c.name,
  })) as ProjectCategory[];

  // ── Single call: duplicate + categories + junk + sensitive ────────────────
  const verdict = await reviewWithLlm(
    settings.model,
    post,
    candidates,
    categories,
    translation
  );
  if (!verdict) return false;

  // Race guard: the team was able to merge/publish/reject the post during the call.
  const { data: fresh } = await service
    .from("feedback_posts")
    .select("id, merged_into_id, is_public, status, review_state, analyzed_at, classified_at")
    .is("deleted_at", null)
    .eq("id", post.id)
    .maybeSingle();
  if (!fresh || fresh.merged_into_id !== null) return true;
  if (fresh.analyzed_at !== null && fresh.classified_at !== null) return true;

  const currentReviewState = fresh.review_state as FeedbackReviewState;
  const currentStatus = fresh.status as FeedbackPostStatus;
  const currentIsPublic = fresh.is_public as boolean;

  const decision = decideFeedbackReview({
    verdict,
    post: {
      source: post.source,
      isPublic: currentIsPublic,
      reviewState: currentReviewState,
      status: currentStatus,
    },
    autoThreshold: settings.autoThreshold,
    suggestFloor: settings.suggestFloor,
  });

  // ── Application, in policy order ─────────────────────────────
  if (decision.categoryIds.length > 0) {
    const res = await setFeedbackPostCategories({
      projectId: post.project_id,
      postId: post.id,
      categoryIds: decision.categoryIds,
    });
    if (res.ok && res.categoryIds.length > 0) report.posts_categorized += 1;
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    analyzed_at: now,
    classified_at: now,
    analysis_claimed_at: null,
    review_state: decision.reviewState,
    sensitivity: decision.sensitivity,
    moderation_reason: decision.moderationReason,
  };
  if (decision.markSpam) updates.status = "spam";
  // The language and translation are FINDINGS on the submitted text, not
  // moderation decisions: they do not go through `decideFeedbackReview`,
  // who would have nothing to say about it. We write them as the pass read them —
  // including `null`, which deletes a translation that has become irrelevant (the team has
  // added the language to its whitelist between two passes).
  if (verdict.sourceLanguage) updates.source_language = verdict.sourceLanguage;
  if (translation.enabled) {
    updates.translated_title = verdict.translation?.title ?? null;
    updates.translated_body = verdict.translation?.body ?? null;
    updates.translated_language = verdict.translation?.language ?? null;
  }
  // We only touch the suggestion if we have looked for duplicates - otherwise
  // we would erase the one that a previous pass had placed (post already analyzed
  // but not yet classified, case of lines before MIN-87).
  if (lookForDuplicates) {
    updates.suggested_merge_into_id = decision.suggestTargetId;
    updates.suggested_confidence = decision.suggestConfidence;
  }
  if (decision.forcePrivate) updates.is_public = false;

  const { error: updError } = await service
    .from("feedback_posts")
    .update(updates)
    .is("deleted_at", null)
    .eq("id", post.id)
    .is("merged_into_id", null);
  if (updError) {
    console.error("[feedback-review] update failed:", updError.message);
    return false;
  }

  // Merge last: the post already has its moderation decision, so nothing
  // can no longer be absorbed without having been judged.
  if (decision.mergeTargetId) {
    const merged = await mergePosts({
      dupId: post.id,
      canonicalId: decision.mergeTargetId,
      performedBy: "ai",
      confidence: verdict.confidence,
    });
    if (merged.ok) {
      report.posts_merged += 1;
    } else {
      // The PRC refused (state displaced under our feet) → we fall back on a
      // suggestion, which the team will decide.
      await service
        .from("feedback_posts")
        .update({
          suggested_merge_into_id: decision.mergeTargetId,
          suggested_confidence: verdict.confidence,
        })
        .is("deleted_at", null)
        .eq("id", post.id)
        .is("merged_into_id", null);
      report.posts_suggested += 1;
    }
  } else if (decision.suggestTargetId) {
    report.posts_suggested += 1;
  }

  // Activity thread: we only report notable moderation actions —
  // forced to private and classified as spam, attributed to Numo
  // (via_assistant). The “normal” publication of a verified post remains
  // silencieuse (pas de bruit).
  const eventUpdates: Record<string, unknown> = {};
  if (decision.forcePrivate) eventUpdates.is_public = false;
  if (decision.markSpam && currentStatus !== "spam") eventUpdates.status = "spam";
  if (Object.keys(eventUpdates).length > 0) {
    await emitFeedbackFieldChanges(service, {
      postId: post.id,
      actorId: null,
      before: { is_public: currentIsPublic, status: currentStatus },
      updates: eventUpdates,
      viaAssistant: true,
    });
  }

  if (decision.forcePrivate) report.posts_forced_private += 1;
  if (decision.markSpam) report.posts_rejected += 1;
  report.posts_reviewed += 1;
  return true;
}

// ── LLM (forced tool call, pattern smart-assign) ─────────────────────────────

function parseEmbedding(value: unknown): number[] | null {
  if (Array.isArray(value) && value.every((v) => typeof v === "number")) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === "number")) {
        return parsed as number[];
      }
    } catch {
      return null;
    }
  }
  return null;
}

async function reviewWithLlm(
  model: string,
  post: ClaimedPost,
  candidates: MatchedPost[],
  categories: ProjectCategory[],
  translation: FeedbackTranslationSettings
) {
  const candidateIds = candidates.map((c) => c.id);
  const categoryIds = categories.map((c) => c.id);
  const hasCandidates = candidateIds.length > 0;
  const hasCategories = categoryIds.length > 0;
  // The “language” block only costs where it serves: a project that cut the
  // traduction ne paie pas de champs qu'il jettera.
  const wantsLanguage = translation.enabled;
  const skipList = effectiveSkipLanguages(translation);

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
6. translated_title / translated_body — a faithful translation of the post into ${translation.teamLanguage}, for the product team to read. Fill them ONLY if the language you reported at step 5 is none of: ${skipList.join(", ")}. Otherwise set both to null. Translate meaning, not word for word; keep product names, code, identifiers and quoted strings exactly as they are. translated_body must be null when the body is empty.
`
      : ""
  }
Junk and sensitive are the only two verdicts to be conservative about: flag them only when clearly warranted. Categories and duplicates are routine — answer them decisively.`;

  const candidateBlock = candidates
    .map(
      (c) =>
        `- post_id ${c.id} (similarity ${c.similarity.toFixed(2)})\n  Title: ${c.title}\n  Body: ${c.body.slice(0, BODY_TRUNCATE) || "(empty)"}`
    )
    .join("\n");
  const categoryBlock = hasCategories
    ? categories.map((c) => `- ${c.id} — ${c.name}`).join("\n")
    : "(none)";

  const userMessage = `## New post
Title: ${post.submitted_title}
Body: ${post.submitted_body.slice(0, BODY_TRUNCATE) || "(empty)"}

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

  const args = await forcedToolCall(
    model,
    systemPrompt,
    userMessage,
    "review_feedback",
    { type: "object", properties, required },
    {
      xTitle: "Feedback Review (minddy)",
      logPrefix: "[feedback-review]",
      modelKey: "feedback_analysis_model",
      record: {
        feature: "feedback_classify",
        // Basic review: it is the owner's budget which authorizes it (line 164),
        // it is therefore to him that she invoices herself — explicitly (MIN-131).
        billTo: { projectOwner: post.project_id },
        projectId: post.project_id,
      },
    }
  );
  if (!args) return null;

  const rawCategoryIds = Array.isArray(args.category_ids) ? args.category_ids : [];
  const validCategoryIds = rawCategoryIds.filter(
    (id): id is string => typeof id === "string" && categoryIds.includes(id)
  );
  const duplicateOf =
    typeof args.duplicate_of === "string" && candidateIds.includes(args.duplicate_of)
      ? args.duplicate_of
      : null;
  const reason =
    typeof args.reason === "string" && args.reason.trim()
      ? args.reason.trim().slice(0, 500)
      : null;

  // The language decides the translation, not the model: it renders a fact (in
  // what language is this text), politics draws a consequence from it. Without
  // this guard, an overzealous response — a French “translation” of a
  // already French text, because it contained three English words — would overwrite
  // the return of a paraphrase.
  const sourceLanguage = wantsLanguage ? normalizeLanguage(args.language) : null;
  const translate = shouldTranslateFeedback(translation, sourceLanguage);
  const text = (value: unknown, max: number): string | null => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed ? trimmed.slice(0, max) : null;
  };

  return {
    duplicateOf,
    confidence: clamp01(args.confidence),
    categoryIds: Array.from(new Set(validCategoryIds)),
    isJunk: args.is_junk === true,
    isSensitive: args.is_sensitive === true,
    sensitivityKind: args.is_sensitive === true ? normalizeSensitivityKind(args.sensitivity_kind) : null,
    reason,
    sourceLanguage,
    // An empty translated title is worthless: without it the interface toggle
    // has nothing to show, so no translation at all.
    translation:
      translate && text(args.translated_title, FEEDBACK_TITLE_MAX)
        ? {
            title: text(args.translated_title, FEEDBACK_TITLE_MAX)!,
            body: text(args.translated_body, FEEDBACK_BODY_MAX),
            language: translation.teamLanguage,
          }
        : null,
  };
}

function clamp01(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(1, Math.max(0, parsed));
}
