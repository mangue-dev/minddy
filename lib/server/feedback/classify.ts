import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getAppConfigValues } from "@/lib/server/app-config";
import { forcedToolCall } from "@/lib/server/feedback/forced-tool-call";
import { setFeedbackPostCategories } from "@/lib/server/feedback/set-post-categories";
import { emitFeedbackFieldChanges } from "@/lib/server/feedback/events";
import {
  normalizeSensitivityKind,
  type FeedbackPostSource,
  type FeedbackReviewState,
} from "@/lib/feedback/types";

/**
 * Passe de classification IA du feedback (MIN-54) — greffée sur le même cron
 * horaire que la passe de merge (analyze.ts), mais DÉCOUPLÉE : gate/lease/échecs
 * propres (`classified_at`, `classification_claimed_at`, `classification_failures`).
 *
 * Pour chaque post non classé : un appel LLM structuré (deepseek-v4-flash, forced
 * tool call comme smart-assign) qui, en une passe, (1) choisit des catégories
 * parmi celles du projet, (2) détecte le junk/spam, (3) détecte un contenu
 * sensible (sécu, bug grave, données perso, légal). Résultat :
 *   - sensible + public → is_public forcé à false (jamais publié), sauf saisie
 *     interne équipe ;
 *   - junk sur un post en attente → review_state 'rejected' ;
 *   - sinon un post en attente → review_state 'published' (apparaît sur le board).
 *
 * Comme la passe de merge : claim `for update skip locked` + lease 15 min ; 3
 * échecs → abandon silencieux ; le board n'est JAMAIS bloqué. L'équipe garde le
 * dernier mot (publier/rejeter/re-publier manuellement).
 */

const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
const DEFAULT_BATCH_SIZE = 50;
const BODY_TRUNCATE = 1500;

interface ClaimedPost {
  id: string;
  project_id: string;
  submitted_title: string;
  submitted_body: string;
  is_public: boolean;
  source: FeedbackPostSource;
  review_state: FeedbackReviewState;
  classification_failures: number;
}

export interface ClassificationReport {
  posts_classified: number;
  posts_categorized: number;
  posts_forced_private: number;
  posts_rejected: number;
  failures: number;
}

export async function runFeedbackClassification(): Promise<ClassificationReport> {
  const report: ClassificationReport = {
    posts_classified: 0,
    posts_categorized: 0,
    posts_forced_private: 0,
    posts_rejected: 0,
    failures: 0,
  };

  const cfg = await getAppConfigValues([
    "feedback_classify_enabled",
    "feedback_classify_model",
    "feedback_classify_batch_size",
  ]);
  // Kill-switch global : n'importe quoi d'autre que "false" reste actif (défaut on).
  if ((cfg["feedback_classify_enabled"] ?? "true").trim() === "false") return report;

  const model = cfg["feedback_classify_model"]?.trim() || DEFAULT_MODEL;
  const batchSize = Math.max(
    1,
    Math.round(parseFloatOr(cfg["feedback_classify_batch_size"], DEFAULT_BATCH_SIZE))
  );

  const service = getServiceClient();

  const { data: claimedPosts, error: claimError } = await service.rpc(
    "claim_feedback_posts_for_classification",
    { p_limit: batchSize }
  );
  if (claimError) {
    console.error("[feedback-classify] claim failed:", claimError.message);
    return report;
  }

  for (const post of (claimedPosts ?? []) as ClaimedPost[]) {
    try {
      const ok = await classifyPost(post, { model, report });
      if (!ok) {
        report.failures += 1;
        await bumpFailure(post.id, post.classification_failures);
      }
    } catch (err) {
      console.error("[feedback-classify] post failed:", (err as Error).message);
      report.failures += 1;
      await bumpFailure(post.id, post.classification_failures);
    }
  }

  return report;
}

function parseFloatOr(value: string | null | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function bumpFailure(id: string, currentFailures: number): Promise<void> {
  // Le lease (classification_claimed_at) reste posé : le retry attend le
  // prochain run horaire. À 3 échecs, la requête de claim ne sélectionne plus
  // la ligne (le post reste alors en attente, l'équipe peut le publier à la main).
  const service = getServiceClient();
  await service
    .from("feedback_posts")
    .update({ classification_failures: currentFailures + 1 })
    .eq("id", id);
}

interface ProjectCategory {
  id: string;
  name: string;
}

async function classifyPost(
  post: ClaimedPost,
  ctx: { model: string; report: ClassificationReport }
): Promise<boolean> {
  const service = getServiceClient();

  // Catégories du projet (partagées avec les issues). L'IA choisit uniquement
  // parmi celles-là — elle n'en crée jamais.
  const { data: catRows } = await service
    .from("categories")
    .select("id, name")
    .eq("project_id", post.project_id);
  const categories = (catRows ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
  })) as ProjectCategory[];

  const out = await reviewWithLlm(ctx.model, post, categories);
  if (!out) return false;

  // Garde de course : l'équipe a pu merger/traiter/classer le post pendant l'appel.
  const { data: fresh } = await service
    .from("feedback_posts")
    .select("id, merged_into_id, classified_at, is_public, review_state")
    .eq("id", post.id)
    .maybeSingle();
  if (!fresh || fresh.merged_into_id !== null || fresh.classified_at !== null) {
    return true;
  }

  const currentReviewState = fresh.review_state as FeedbackReviewState;
  const currentIsPublic = fresh.is_public as boolean;

  // Catégories : full-replace via le core partagé (valide l'appartenance au projet).
  if (out.categoryIds.length > 0) {
    const res = await setFeedbackPostCategories({
      projectId: post.project_id,
      postId: post.id,
      categoryIds: out.categoryIds,
    });
    if (res.ok && res.categoryIds.length > 0) ctx.report.posts_categorized += 1;
  }

  // Sensible : passage forcé en privé (jamais la saisie interne équipe, ni un
  // post déjà privé). C'est la protection anti-fuite du board public.
  const forcePrivate =
    out.isSensitive && currentIsPublic && post.source !== "internal";

  // État de publication : seul un post « en attente » est promu par l'IA. Un
  // post déjà publié (saisie interne) ou déjà rejeté n'est pas rebasculé ici.
  let nextReviewState = currentReviewState;
  if (currentReviewState === "pending") {
    nextReviewState = out.isJunk ? "rejected" : "published";
  }

  const updates: Record<string, unknown> = {
    classified_at: new Date().toISOString(),
    classification_claimed_at: null,
    sensitivity: out.isSensitive ? out.sensitivityKind : null,
    moderation_reason: out.reason,
    review_state: nextReviewState,
  };
  if (forcePrivate) updates.is_public = false;

  const { error: updError } = await service
    .from("feedback_posts")
    .update(updates)
    .eq("id", post.id)
    .is("merged_into_id", null);
  if (updError) {
    console.error("[feedback-classify] update failed:", updError.message);
    return false;
  }

  // Fil d'activité : on ne raconte que les actions notables de modération —
  // passage forcé en privé et rejet junk, attribués à Numo (via_assistant). La
  // publication « normale » d'un post vérifié reste silencieuse (pas de bruit).
  const eventUpdates: Record<string, unknown> = {};
  if (forcePrivate) eventUpdates.is_public = false;
  if (nextReviewState === "rejected") eventUpdates.review_state = "rejected";
  if (Object.keys(eventUpdates).length > 0) {
    await emitFeedbackFieldChanges(service, {
      postId: post.id,
      actorId: null,
      before: { is_public: currentIsPublic, review_state: currentReviewState },
      updates: eventUpdates,
      viaAssistant: true,
    });
  }

  if (forcePrivate) ctx.report.posts_forced_private += 1;
  if (nextReviewState === "rejected") ctx.report.posts_rejected += 1;
  ctx.report.posts_classified += 1;
  return true;
}

// ── LLM (forced tool call, pattern smart-assign / analyze.ts) ────────────────

interface ReviewOutput {
  categoryIds: string[];
  isJunk: boolean;
  isSensitive: boolean;
  sensitivityKind: string;
  reason: string | null;
}

async function reviewWithLlm(
  model: string,
  post: ClaimedPost,
  categories: ProjectCategory[]
): Promise<ReviewOutput | null> {
  const categoryIds = categories.map((c) => c.id);
  const hasCategories = categoryIds.length > 0;

  const systemPrompt = `You review new posts submitted to a product feedback board BEFORE they are published publicly. Call review_feedback exactly once. Never reply in plain text.

Decide three things about the ONE post below:
1. Categories — ${
    hasCategories
      ? "pick every category id from the provided list that fits the post (0, 1 or several). Choose only from the list; never invent ids."
      : "the project defines no categories — return an empty list."
  }
2. is_junk — true only if the post is spam, gibberish, an empty test, an ad, or abuse with no real product signal. A short but genuine request is NOT junk.
3. is_sensitive — true if publishing the post publicly could cause harm: an exploitable security vulnerability, a severe/data-loss bug, leaked secrets/credentials, personal data (emails, tokens, private identities), or legally sensitive content. Ordinary bug reports and feature requests are NOT sensitive. When sensitive, set sensitivity_kind and give a short reason.

Be conservative: only flag junk or sensitive when clearly warranted.`;

  const categoryBlock = hasCategories
    ? categories.map((c) => `- ${c.id} — ${c.name}`).join("\n")
    : "(none)";

  const userMessage = `## Post
Title: ${post.submitted_title}
Body: ${post.submitted_body.slice(0, BODY_TRUNCATE) || "(empty)"}

## Available categories
${categoryBlock}`;

  const properties: Record<string, unknown> = {
    is_junk: { type: "boolean" },
    is_sensitive: { type: "boolean" },
    sensitivity_kind: {
      type: ["string", "null"],
      enum: ["security", "severe_bug", "personal_data", "legal", "other", null],
    },
    reason: { type: ["string", "null"] },
  };
  if (hasCategories) {
    properties.category_ids = {
      type: "array",
      items: { type: "string", enum: categoryIds },
    };
  }

  const args = await forcedToolCall(
    model,
    systemPrompt,
    userMessage,
    "review_feedback",
    { type: "object", properties, required: ["is_junk", "is_sensitive"] },
    {
      xTitle: "Feedback Classification (minddy)",
      logPrefix: "[feedback-classify]",
      record: { feature: "feedback_classify", projectId: post.project_id },
    }
  );
  if (!args) return null;

  const rawIds = Array.isArray(args.category_ids) ? args.category_ids : [];
  const validIds = rawIds.filter(
    (id): id is string => typeof id === "string" && categoryIds.includes(id)
  );
  const isSensitive = args.is_sensitive === true;
  const reasonText =
    typeof args.reason === "string" && args.reason.trim() ? args.reason.trim().slice(0, 500) : null;

  return {
    categoryIds: Array.from(new Set(validIds)),
    isJunk: args.is_junk === true,
    isSensitive,
    sensitivityKind: normalizeSensitivityKind(args.sensitivity_kind),
    reason: reasonText,
  };
}
