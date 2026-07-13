/**
 * Types partagés du feedback public (MIN-37) — importables côté client comme
 * côté serveur (pas de "server-only" ici). Les shapes publiques sont
 * anonymisées : jamais d'email ni de vrai nom côté board.
 */

export const FEEDBACK_POST_STATUSES = [
  "open",
  "planned",
  "in_progress",
  "shipped",
  "declined",
] as const;
export type FeedbackPostStatus = (typeof FEEDBACK_POST_STATUSES)[number];

export function isFeedbackPostStatus(value: unknown): value is FeedbackPostStatus {
  return (
    typeof value === "string" &&
    (FEEDBACK_POST_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Statuts « terminés » : un besoin livré (shipped) ou refusé (declined) est
 * résolu et n'a plus à occuper le haut des listes. On les range en bas, board
 * public comme onglet équipe.
 */
export const FEEDBACK_RESOLVED_STATUSES: readonly FeedbackPostStatus[] = [
  "shipped",
  "declined",
];

export function isResolvedFeedbackStatus(status: FeedbackPostStatus): boolean {
  return FEEDBACK_RESOLVED_STATUSES.includes(status);
}

/**
 * Repousse les feedbacks résolus en bas sans casser l'ordre déjà appliqué
 * (votes/date) : partition stable — Array.prototype.sort l'est en JS moderne.
 */
export function sortFeedbackResolvedLast<T>(
  items: T[],
  getStatus: (item: T) => FeedbackPostStatus
): T[] {
  return [...items].sort(
    (a, b) =>
      Number(isResolvedFeedbackStatus(getStatus(a))) -
      Number(isResolvedFeedbackStatus(getStatus(b)))
  );
}

export type FeedbackPostSource = "board" | "api" | "internal";

/** Post tel que rendu sur le board public (anonymisé). */
export interface PublicPost {
  id: string;
  title: string;
  body: string;
  status: FeedbackPostStatus;
  /** false = retour privé : remonté à l'équipe mais absent du board public. */
  isPublic: boolean;
  voteCount: number;
  createdAt: string;
  authorPseudonym: string | null;
  isMine: boolean;
  votedByMe: boolean;
  teamResponse: string | null;
  teamResponseAt: string | null;
}

/** Onglet de navigation du site public (board + vues partagées du projet). */
export interface PublicSiteTab {
  label: string;
  href: string;
  active: boolean;
}

/** Suggestion « ce post existe peut-être déjà » du composeur public. */
export interface SimilarPost {
  id: string;
  title: string;
  status: FeedbackPostStatus;
  voteCount: number;
}

/** Identité de session côté board public. */
export interface PublicIdentity {
  pseudonym: string;
  email: string | null;
}
