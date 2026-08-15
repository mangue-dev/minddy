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
 * Passe de revue du feedback (MIN-87) — UNE passe, UN appel LLM par post, qui
 * remplace les deux passes séparées d'avant (dédoublonnage MIN-37 puis
 * classification MIN-54).
 *
 * Pourquoi les fusionner : elles tournaient dans le mauvais ordre. Le merge
 * passait en premier, et un post fusionné sort de la file de classification (le
 * claim exclut `merged_into_id`) — un junk pouvait donc être absorbé par un vrai
 * post, sa voix gonflant le canonique, et un rapport de sécurité pouvait être
 * fusionné AVANT d'être détecté sensible, donc ne jamais être signalé à
 * l'équipe. Une seule décision, prise dans le bon ordre (modérer → protéger →
 * catégoriser → dédoublonner), supprime la fenêtre — et divise le coût par deux.
 *
 * Deux déclencheurs partagent le même cœur :
 *   - `reviewFeedbackPost(id)` — à la soumission, via `after()` : un retour
 *     apparaît sur le board en quelques secondes au lieu d'attendre le cron ;
 *   - `runFeedbackReview()` — le cron horaire, filet de sécurité pour les posts
 *     dont la revue immédiate a échoué (LLM en panne, budget revenu depuis).
 *
 * Concurrence : claim `for update skip locked` + lease de 15 min
 * (auto-guérissant si un run crashe) ; 3 échecs → abandon, le post reste en
 * attente et remonte dans le filtre « À revoir » de l'équipe (fail-closed
 * assumé : rien de non modéré ne part sur un board public).
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
  /** Junk classé `spam` par la modération. */
  posts_rejected: number;
  /** Publiés sans revue : projet qui l'a désarmée, ou bascule budget épuisé. */
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
 * Réglages de traduction d'un projet (colonnes `projects`, défauts sûrs).
 *
 * `feedback_team_language` peut être NULL — les projets d'avant la migration, et
 * ceux créés hors du wizard. On retombe alors sur la locale par défaut de l'app
 * plutôt que de couper la traduction : une équipe qui n'a rien réglé lit
 * probablement l'anglais, et le réglage est à un clic pour dire le contraire.
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

/** Réglages de revue d'un projet (colonnes `projects`, défauts sûrs si absent). */
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
 * La revue est-elle armée pour ce projet ? Kill-switch d'instance ET réglage du
 * owner. Quand elle ne l'est pas, retenir les posts en attente n'aurait aucun
 * sens — personne ne viendra les publier : la création les publie d'emblée
 * (cf. `createFeedbackPost`).
 */
export async function isFeedbackReviewEnabled(projectId: string): Promise<boolean> {
  if (!(await loadSettings()).enabled) return false;
  return (await projectReviewSettings(projectId)).reviewEnabled;
}

/**
 * Ce qu'on fait d'un post à revoir, réglages du projet et budget du owner
 * compris. Voir `resolveFeedbackReviewMode` pour la table de vérité.
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
 * Publication sans revue : le post sort en l'état, ni catégorisé ni modéré. On
 * pose les deux marqueurs de complétion pour qu'il ne revienne pas dans la file
 * — re-armer la revue (ou recharger son budget) ne déclenche pas une passe
 * rétroactive surprise sur tout l'historique.
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
  // Seul un post en attente est promu : une décision d'équipe (publié / écarté
  // à la main) fait foi, comme partout ailleurs dans la revue.
  if (fresh.review_state === "pending") updates.review_state = "published";
  await service
    .from("feedback_posts")
    .update(updates)
    .is("deleted_at", null)
    .eq("id", postId)
    .is("merged_into_id", null);
}

/** Passe de lot (cron horaire) : rattrape tout ce que la revue immédiate a raté. */
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

  // Un seul résolution de mode par projet dans le lot (budget + réglages du
  // owner) : c'est deux lectures, inutile de les refaire pour chaque post.
  const modeByProject = new Map<string, FeedbackReviewMode>();

  for (const post of (claimed ?? []) as ClaimedPost[]) {
    let mode = modeByProject.get(post.project_id);
    if (mode === undefined) {
      mode = await reviewModeForProject(post.project_id);
      modeByProject.set(post.project_id, mode);
    }

    if (mode === "hold") continue; // budget épuisé, pas de bascule demandée
    if (mode === "publish") {
      // Revue désarmée, ou budget épuisé avec bascule demandée : on libère le
      // post plutôt que de le laisser en attente indéfiniment.
      await publishWithoutReview(post.id);
      report.posts_published_unreviewed += 1;
      continue;
    }

    await runOne(post, settings, report);
  }

  return report;
}

/**
 * Revue d'un seul post, déclenchée juste après sa soumission (`after()`). Pose
 * le même lease que le cron pour que les deux ne se marchent pas dessus ; sort
 * en silence si un autre run a déjà pris le post ou s'il est déjà revu.
 */
export async function reviewFeedbackPost(
  postId: string,
  projectId: string
): Promise<ReviewReport> {
  const report = emptyReport();
  const settings = await loadSettings();
  if (!settings.enabled) return report;

  // Mode AVANT le claim : un post qu'on ne va pas revoir ne doit pas se voir
  // poser un lease de 15 min — sinon la reprise par le cron serait retardée
  // d'autant après le retour du budget.
  const mode = await reviewModeForProject(projectId);
  if (mode === "hold") return report;
  if (mode === "publish") {
    await publishWithoutReview(postId);
    report.posts_published_unreviewed += 1;
    return report;
  }

  const service = getServiceClient();
  // Même claim que le cron, ciblé sur un post : ni double traitement, ni reprise
  // d'un post déjà revu.
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
  // Le lease (analysis_claimed_at) reste posé : le retry attend le prochain run
  // horaire. À 3 échecs, le claim ne sélectionne plus la ligne — le post reste
  // en attente et l'équipe le voit dans « À revoir ».
  const service = getServiceClient();
  await service
    .from("feedback_posts")
    .update({ analysis_failures: currentFailures + 1 })
    .is("deleted_at", null)
    .eq("id", id);
}

/** Paires interdites (undo / suggestions rejetées), dans les deux sens. */
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
 * Écarte les candidats de fusion classés spam : absorber un vrai retour dans un
 * post écarté par la modération l'enterrerait derrière un tombstone invisible.
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

  // ── Contexte : embedding (backfill si la soumission n'avait pas pu le
  //    calculer), voisins kNN, catégories du projet ────────────────────────────
  let embedding = post.embedding ? parseEmbedding(post.embedding) : null;
  if (!embedding) {
    embedding = await embedText(
      post.submitted_body
        ? `${post.submitted_title}\n\n${post.submitted_body}`
        : post.submitted_title,
      // Passe de fond (cron) : pas de déclencheur, le owner paye (MIN-131).
      { record: { billTo: { projectOwner: post.project_id }, projectId: post.project_id } }
    );
    if (!embedding) return false;
    await service
      .from("feedback_posts")
      .update({ embedding: toVectorLiteral(embedding) })
      .is("deleted_at", null)
      .eq("id", post.id);
  }

  // Un post déjà dédoublonné (marqueur d'avant MIN-87) ne repasse pas par la
  // recherche de doublons : on ne re-proposerait qu'une fusion déjà tranchée.
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

  // ── Un seul appel : doublon + catégories + junk + sensible ────────────────
  const verdict = await reviewWithLlm(
    settings.model,
    post,
    candidates,
    categories,
    translation
  );
  if (!verdict) return false;

  // Garde de course : l'équipe a pu merger/publier/rejeter le post pendant l'appel.
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

  // ── Application, dans l'ordre de la politique ─────────────────────────────
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
  // La langue et la traduction sont des CONSTATS sur le texte soumis, pas des
  // décisions de modération : elles ne passent pas par `decideFeedbackReview`,
  // qui n'aurait rien à en dire. On les écrit telles que la passe les a lues —
  // y compris `null`, qui efface une traduction devenue sans objet (l'équipe a
  // ajouté la langue à sa liste blanche entre deux passes).
  if (verdict.sourceLanguage) updates.source_language = verdict.sourceLanguage;
  if (translation.enabled) {
    updates.translated_title = verdict.translation?.title ?? null;
    updates.translated_body = verdict.translation?.body ?? null;
    updates.translated_language = verdict.translation?.language ?? null;
  }
  // On ne touche à la suggestion que si l'on a bien cherché des doublons — sinon
  // on effacerait celle qu'une passe précédente avait posée (post déjà analysé
  // mais pas encore classé, cas des lignes d'avant MIN-87).
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

  // Fusion en dernier : le post porte déjà sa décision de modération, donc rien
  // ne peut plus être absorbé sans avoir été jugé.
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
      // La RPC a refusé (état déplacé sous nos pieds) → on retombe sur une
      // suggestion, que l'équipe tranchera.
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

  // Fil d'activité : on ne raconte que les actions notables de modération —
  // passage forcé en privé et classement en spam, attribués à Numo
  // (via_assistant). La publication « normale » d'un post vérifié reste
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
  // Le bloc « langue » ne coûte que là où il sert : un projet qui a coupé la
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
  // Ce qui n'est pas `required` n'est tout simplement pas répondu par un petit
  // modèle : sans ça il ne renvoie que le verdict de modération et tout post
  // paraît unique. Chaque décision attendue doit donc être exigée.
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
    // `und` (ISO 639-2 « indéterminé ») plutôt que null : un petit modèle à qui
    // l'on offre null pour une question factuelle le choisit dès qu'il hésite,
    // et tout devient indéterminé. Un code à donner l'oblige à trancher, et
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
        // Revue de fond : c'est le budget du owner qui l'autorise (ligne 164),
        // c'est donc à lui qu'elle se facture — explicitement (MIN-131).
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

  // La langue décide de la traduction, pas le modèle : il rend un fait (dans
  // quelle langue est ce texte), la politique en tire une conséquence. Sans
  // cette garde, une réponse trop zélée — une « traduction » française d'un
  // texte déjà français, parce qu'il contenait trois mots anglais — écraserait
  // le retour d'une paraphrase.
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
    // Un titre traduit vide ne vaut rien : sans lui la bascule de l'interface
    // n'a rien à montrer, donc pas de traduction du tout.
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
