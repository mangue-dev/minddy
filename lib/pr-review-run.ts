/**
 * La review d'une PR par Numo vue comme une SESSION — le vocabulaire partagé
 * entre le serveur qui la joue (`lib/server/agent/pr-review-runs.ts`) et l'écran
 * qui la regarde (`components/pull-requests/pr-review-panel.tsx`).
 *
 * Module PUR : aucun import serveur, il traverse la frontière.
 *
 * Le flux d'événements est ce que Numo FAIT, dans l'ordre où il le fait — pas
 * une barre de progression inventée côté client. Chaque type correspond à un
 * moment réel de la passe (`runPrAiReview`) :
 *
 *   `status`  — la phase change (lecture du diff → du ticket → analyse → dépôt) ;
 *   `context` — ce qu'il vient de lire, avec ses chiffres (n fichiers, le plan
 *               du ticket, n messages déjà écrits sur la PR) ;
 *   `finding` — un point, au moment où il est POSÉ sur la PR (ou replié dans la
 *               synthèse quand son ancre a été refusée) ;
 *   `summary` — le verdict et la synthèse, une fois publiés ;
 *   `error`   — la passe s'arrête, avec son code (traduit à l'affichage).
 *
 * Le texte que le modèle écrit PENDANT l'analyse ne passe pas par là : il est
 * diffusé en éphémère sur le topic (`stream`), parce qu'un brouillon réémis
 * quatre fois par seconde n'a rien à faire en base.
 */

/**
 * Gravité d'un point, de la plus sérieuse à la moins. Définie ICI et non dans le
 * cœur de la passe : elle voyage jusqu'à l'écran (couleur de la pastille d'un
 * point), et l'écran n'a rien à importer de `lib/server`.
 */
export type FindingSeverity = "blocker" | "risk" | "nit";

export type PrReviewStatus = "running" | "done" | "failed";

export type PrReviewEventType = "status" | "context" | "finding" | "summary" | "error";

/** Les phases, dans l'ordre où elles s'enchaînent. */
export type PrReviewPhase = "reading" | "analyzing" | "posting" | "finished";

/** Codes d'échec — la traduction vit dans les catalogues, jamais en base. */
export type PrReviewErrorCode =
  | "noDiff"
  | "modelUnavailable"
  | "modelRefused"
  | "forge"
  | "unknown";

export interface PrReviewStatusPayload {
  phase: PrReviewPhase;
}

/**
 * Ce que la passe a lu. Une entrée par source, servie dès qu'elle est lue :
 * `diff` ouvre toujours, `issue` manque sur une PR non rattachée (état normal
 * depuis MIN-143), `conversation` vaut zéro sur une PR neuve.
 */
export type PrReviewContextPayload =
  | { kind: "diff"; files: number; additions: number; deletions: number }
  | { kind: "issue"; identifier: string; hasPlan: boolean; comments: number }
  | { kind: "conversation"; comments: number; reviews: number; reviewComments: number };

export interface PrReviewFindingPayload {
  path: string;
  line: number;
  severity: FindingSeverity;
  body: string;
  /** Posé en commentaire de ligne (`true`) ou replié dans la synthèse (`false`). */
  anchored: boolean;
}

export interface PrReviewSummaryPayload {
  verdict: "approve" | "request_changes" | "comment";
  summary: string;
  /** Commentaires de ligne réellement déposés. */
  inlineComments: number;
}

export interface PrReviewErrorPayload {
  code: PrReviewErrorCode;
}

export type PrReviewEventPayload =
  | PrReviewStatusPayload
  | PrReviewContextPayload
  | PrReviewFindingPayload
  | PrReviewSummaryPayload
  | PrReviewErrorPayload;

export interface PrReviewEvent {
  id: string;
  seq: number;
  type: PrReviewEventType;
  payload: PrReviewEventPayload | null;
  created_at: string;
}

/** La passe elle-même, telle que l'écran la lit. */
export interface PrReviewRun {
  id: string;
  status: PrReviewStatus;
  model: string;
  /** Le diff RELU — comparé à la tête courante pour savoir si relire a un sens. */
  headSha: string | null;
  verdict: PrReviewSummaryPayload["verdict"] | null;
  inlineComments: number;
  /** Le commentaire du fil qui porte la synthèse : c'est à lui que le
   *  déroulé de la passe se rattache dans la conversation. */
  summaryCommentId: number | null;
  error: PrReviewErrorCode | null;
  createdAt: string;
  finishedAt: string | null;
  /** La passe a été demandée par le lecteur courant. Un échec ne concerne que
   *  lui : c'est lui qui a cliqué, et lui seul qui peut relancer. */
  mine: boolean;
}

/** Topic privé du direct d'une passe (migration 20260927090000_pr_review_runs). */
export function prReviewTopic(reviewId: string): string {
  return `pr-review:${reviewId}`;
}

/**
 * Charge utile du direct : l'état COMPLET de ce que le modèle a écrit jusqu'ici,
 * pas un delta — un message perdu se rattrape au suivant, sans trou dans le
 * texte. Même contrat que le direct d'un run d'agent.
 */
export interface PrReviewLiveStream {
  /** La synthèse telle qu'elle s'écrit, extraite du tool call en cours. */
  summary: string;
  /** Points déjà complets dans le flux — le compteur qui monte pendant l'analyse. */
  findings: number;
  /** Horodatage d'émission (ms) : le client jette ce qui arrive dans le désordre. */
  at: number;
}

/**
 * Une passe est-elle encore vivante ? Une session laissée `running` par une
 * fonction tuée en plein vol ne doit pas bloquer l'écran pour toujours : passé
 * ce délai, elle est traitée comme abandonnée (elle ne peut plus rien écrire —
 * le tour de modèle a son propre plafond à 3 minutes).
 */
export const PR_REVIEW_STALE_MS = 6 * 60 * 1000;

export function isPrReviewActive(run: PrReviewRun | null, now = Date.now()): boolean {
  if (!run || run.status !== "running") return false;
  return now - new Date(run.createdAt).getTime() < PR_REVIEW_STALE_MS;
}
