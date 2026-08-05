import type {
  FeedbackPostSource,
  FeedbackPostStatus,
  FeedbackReviewState,
  FeedbackSensitivityKind,
} from "@/lib/feedback/types";

/**
 * Politique de revue d'un feedback (MIN-87) — le cœur de décision de la passe
 * IA, isolé en fonction PURE pour être testable sans base ni LLM.
 *
 * Une seule passe décide de tout, et l'ORDRE compte (c'est le défaut que MIN-87
 * corrige : avant, le dédoublonnage tournait avant la modération) :
 *
 *   1. modérer — un junk part en `spam` et ne va nulle part ailleurs. Il ne peut
 *      donc plus être fusionné dans un vrai post, où sa voix gonflait le
 *      compteur du canonique et où il échappait ensuite à toute modération ;
 *   2. protéger — un contenu sensible (sécurité, données perso, légal) passe en
 *      privé et n'est JAMAIS fusionné automatiquement : un rapport de sécurité
 *      absorbé par une demande de fonctionnalité disparaîtrait de la vue de
 *      l'équipe. Au mieux une suggestion, que l'équipe tranche ;
 *   3. catégoriser — sauf sur un post qui part en fusion : le canonique porte
 *      déjà ses propres catégories, celles du tombstone ne seraient jamais lues ;
 *   4. dédoublonner — fusion auto au-dessus du seuil, suggestion au-dessus du
 *      plancher.
 *
 * L'IA ne rétrograde jamais une décision humaine : elle ne fait passer un post
 * de `pending` à `published`, jamais l'inverse, et ne classe en `spam` qu'un
 * post qu'aucune main n'a encore tranché.
 */

/**
 * Ce qu'il advient d'un retour qui arrive : le revoir, le publier tel quel, ou
 * le retenir. Trois issues, deux réglages projet.
 *
 * - `review` — le cas normal : Numo catégorise, filtre et modère avant publication.
 * - `publish` — publication directe, sans catégorie ni modération. Soit le owner
 *   a désarmé la revue, soit son budget IA est épuisé ET il a demandé qu'on
 *   bascule dans ce mode plutôt que de bloquer le board.
 * - `hold` — le retour reste en attente : la revue est armée mais ne peut pas
 *   tourner (budget épuisé). Fail-closed : rien de non modéré ne part sur un
 *   board public. L'équipe le voit dans « À revoir » et tranche à la main.
 */
export type FeedbackReviewMode = "review" | "publish" | "hold";

export function resolveFeedbackReviewMode(params: {
  /** Revue armée : kill-switch d'instance ET réglage du projet. */
  reviewEnabled: boolean;
  /** Budget IA restant chez le owner du projet. */
  hasBudget: boolean;
  /** Réglage projet : publier sans revue quand le budget est épuisé. */
  skipOverBudget: boolean;
}): FeedbackReviewMode {
  if (!params.reviewEnabled) return "publish";
  if (params.hasBudget) return "review";
  return params.skipOverBudget ? "publish" : "hold";
}

/** Sortie du modèle, déjà normalisée (ids validés, bornes appliquées). */
export interface FeedbackReviewVerdict {
  /** Id du post dont celui-ci est un doublon, ou null. */
  duplicateOf: string | null;
  /** Certitude du doublon, 0–1. */
  confidence: number;
  /** Catégories du projet retenues (ids déjà validés). */
  categoryIds: string[];
  isJunk: boolean;
  isSensitive: boolean;
  sensitivityKind: FeedbackSensitivityKind | null;
  /** Motif court, visible équipe. */
  reason: string | null;
}

/** État du post au moment d'appliquer la décision (relu juste avant écriture). */
export interface FeedbackReviewSubject {
  source: FeedbackPostSource;
  isPublic: boolean;
  reviewState: FeedbackReviewState;
  /**
   * Statut courant. Il entre dans la décision parce que `spam` en fait
   * désormais partie : un retour déjà écarté — par l'équipe, ou par une passe
   * précédente — ne doit plus être fusionné dans un vrai, où sa voix gonflerait
   * le compteur du canonique.
   */
  status: FeedbackPostStatus;
}

export interface FeedbackReviewDecision {
  reviewState: FeedbackReviewState;
  /** true → poser le statut `spam` (junk détecté, retour hors du board). */
  markSpam: boolean;
  /** true → forcer `is_public` à false (anti-fuite du board public). */
  forcePrivate: boolean;
  sensitivity: FeedbackSensitivityKind | null;
  moderationReason: string | null;
  /** Catégories à poser (remplacement complet). Vide = ne rien toucher. */
  categoryIds: string[];
  /** Fusion automatique à exécuter, ou null. */
  mergeTargetId: string | null;
  /** Suggestion de fusion à proposer à l'équipe, ou null. */
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

  // Le verdict de junk ne s'applique qu'à un post encore en attente : une fois
  // que l'équipe a publié (ou rejeté) un post, c'est sa décision qui fait foi.
  const rejectAsJunk = verdict.isJunk && post.reviewState === "pending";

  const sensitivity = verdict.isSensitive
    ? (verdict.sensitivityKind ?? "other")
    : null;
  // La saisie interne vient de l'équipe elle-même : elle sait ce qu'elle publie,
  // on ne la privatise pas dans son dos. Un post déjà privé n'a rien à changer.
  const forcePrivate =
    verdict.isSensitive && post.isPublic && post.source !== "internal";

  const reason = verdict.reason?.trim() || null;

  const decision: FeedbackReviewDecision = {
    reviewState: post.reviewState,
    markSpam: rejectAsJunk,
    forcePrivate,
    sensitivity,
    // On ne conserve un motif que quand il explique une action de modération —
    // sinon le badge « sensible » s'afficherait avec un commentaire hors sujet.
    moderationReason: rejectAsJunk || verdict.isSensitive ? reason : null,
    categoryIds: [],
    mergeTargetId: null,
    suggestTargetId: null,
    suggestConfidence: null,
  };

  // Un junk s'arrête ici : ni catégories, ni fusion, ni suggestion. Un retour
  // DÉJÀ classé spam s'arrête au même endroit, et pour la même raison — il n'a
  // rien à faire dans un vrai retour.
  //
  // Sa revue est bel et bien passée, elle : il sort donc de la file d'attente
  // comme les autres, sinon « À revoir » le signalerait indéfiniment comme
  // n'ayant pas été tranché — alors qu'il vient de l'être.
  if (rejectAsJunk || post.status === "spam") {
    if (post.reviewState === "pending") decision.reviewState = "published";
    return decision;
  }

  if (post.reviewState === "pending") decision.reviewState = "published";

  const duplicate =
    verdict.duplicateOf && verdict.confidence >= suggestFloor
      ? verdict.duplicateOf
      : null;
  // Fusion auto seulement si l'on est sûr ET que le post n'est pas sensible :
  // un contenu sensible reste debout, l'équipe décide.
  const autoMerge =
    duplicate !== null && !verdict.isSensitive && verdict.confidence >= autoThreshold;

  if (autoMerge) {
    decision.mergeTargetId = duplicate;
  } else if (duplicate !== null) {
    decision.suggestTargetId = duplicate;
    decision.suggestConfidence = verdict.confidence;
  }

  // Catégoriser un tombstone n'a pas de lecteur : le canonique porte les siennes.
  if (!autoMerge) decision.categoryIds = verdict.categoryIds;

  return decision;
}
