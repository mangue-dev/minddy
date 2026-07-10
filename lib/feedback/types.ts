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

export type FeedbackPostSource = "board" | "api" | "internal";
export type FeedbackFacetSource = "ai" | "user" | "team";

/** Facette telle que rendue sur le board public (anonymisée). */
export interface PublicFacet {
  id: string;
  text: string;
  voteCount: number;
  votedByMe: boolean;
  isMine: boolean;
}

/** Post tel que rendu sur le board public (anonymisé). */
export interface PublicPost {
  id: string;
  title: string;
  body: string;
  status: FeedbackPostStatus;
  voteCount: number;
  facetCount: number;
  createdAt: string;
  authorPseudonym: string | null;
  isMine: boolean;
  votedByMe: boolean;
  teamResponse: string | null;
  teamResponseAt: string | null;
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
