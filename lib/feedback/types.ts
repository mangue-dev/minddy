/**
 * Types partagés du feedback public (MIN-37) — importables côté client comme
 * côté serveur (pas de "server-only" ici). Les shapes publiques sont
 * anonymisées : jamais d'email ni de vrai nom côté board.
 */

/**
 * Les états d'un retour. `spam` en fait partie comme les autres — c'est une
 * décision sur le retour, pas un axe parallèle, et l'équipe la pose là où elle
 * pose toutes les autres. Il n'apparaît JAMAIS sur le board public.
 */
export const FEEDBACK_POST_STATUSES = [
  "open",
  "planned",
  "in_progress",
  "shipped",
  "declined",
  "spam",
] as const;
export type FeedbackPostStatus = (typeof FEEDBACK_POST_STATUSES)[number];

export function isFeedbackPostStatus(value: unknown): value is FeedbackPostStatus {
  return (
    typeof value === "string" &&
    (FEEDBACK_POST_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Ce que le board public sait nommer. Le spam n'y est ni listé ni filtrable :
 * proposer le filtre reviendrait à annoncer aux visiteurs qu'il existe une
 * catégorie de retours cachés, et le filtre ne rendrait jamais rien.
 */
export const FEEDBACK_PUBLIC_STATUSES: readonly FeedbackPostStatus[] =
  FEEDBACK_POST_STATUSES.filter((status) => status !== "spam");

/** Un retour hors du board public — aujourd'hui le seul cas est le spam. */
export function isHiddenFeedbackStatus(status: FeedbackPostStatus): boolean {
  return status === "spam";
}

/**
 * Statuts « terminés » : un besoin livré (shipped), refusé (declined) ou écarté
 * (spam) est résolu et n'a plus à occuper le haut des listes. On les range en
 * bas, board public comme onglet équipe.
 */
export const FEEDBACK_RESOLVED_STATUSES: readonly FeedbackPostStatus[] = [
  "shipped",
  "declined",
  "spam",
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

/** Bornes d'un post, appliquées à la création (lib/server/feedback/posts.ts) et
    ANNONCÉES aux agents par le contrat d'intégration (lib/feedback/integration-contract.ts) :
    elles vivent donc ici, en pur, plutôt que dans le core serveur. */
export const FEEDBACK_TITLE_MAX = 200;
export const FEEDBACK_BODY_MAX = 10_000;

/**
 * État de PUBLICATION d'un post (MIN-54), distinct du choix de visibilité
 * `is_public` de l'auteur. `pending` = en attente de la revue IA (catégorisation
 * + modération), invisible du board même si public ; `published` = vérifié, listé
 * si public.
 *
 * Il portait un troisième état, `rejected`, pour le junk détecté par la revue.
 * C'était une deuxième façon d'exclure un retour, à côté de son statut, et
 * l'équipe devait la chercher ailleurs que là où elle lisait tout le reste :
 * c'est devenu le statut `spam`. Ne reste ici que la file d'attente.
 */
export const FEEDBACK_REVIEW_STATES = ["pending", "published"] as const;
export type FeedbackReviewState = (typeof FEEDBACK_REVIEW_STATES)[number];

export function isFeedbackReviewState(value: unknown): value is FeedbackReviewState {
  return (
    typeof value === "string" &&
    (FEEDBACK_REVIEW_STATES as readonly string[]).includes(value)
  );
}

/**
 * Nature de sensibilité détectée par l'IA (MIN-54). Non exhaustif côté modèle :
 * validé applicativement, `other` sert de fourre-tout. Null = non sensible.
 */
export const FEEDBACK_SENSITIVITY_KINDS = [
  "security",
  "severe_bug",
  "personal_data",
  "legal",
  "other",
] as const;
export type FeedbackSensitivityKind = (typeof FEEDBACK_SENSITIVITY_KINDS)[number];

export function normalizeSensitivityKind(value: unknown): FeedbackSensitivityKind {
  return typeof value === "string" &&
    (FEEDBACK_SENSITIVITY_KINDS as readonly string[]).includes(value)
    ? (value as FeedbackSensitivityKind)
    : "other";
}

/** Catégorie telle qu'exposée publiquement (MIN-52) — slice minimal du modèle
    interne : ni project_id ni dates. */
export interface PublicCategory {
  id: string;
  name: string;
  color: string;
}

/** Post tel que rendu sur le board public (anonymisé). */
export interface PublicPost {
  id: string;
  title: string;
  body: string;
  status: FeedbackPostStatus;
  /** false = retour privé : remonté à l'équipe mais absent du board public. */
  isPublic: boolean;
  /** État de publication (MIN-54). Sur le board public toujours `published` ;
      informatif sur « mes feedbacks » (l'auteur voit ses posts en attente). */
  reviewState: FeedbackReviewState;
  voteCount: number;
  createdAt: string;
  authorPseudonym: string | null;
  isMine: boolean;
  votedByMe: boolean;
  teamResponse: string | null;
  teamResponseAt: string | null;
  /** Catégories du post — vide sauf si le board a activé show_categories. */
  categories: PublicCategory[];
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
  /**
   * La graine d'avatar du compte minddy derrière ce visiteur, quand le SSO du
   * board l'a identifié — son visage de l'app, à l'identique. Null sinon
   * (OTP, SSO d'un autre produit) : l'avatar retombe alors sur le pseudonyme.
   * Ne sert QUE dans le header, que son propriétaire est seul à voir.
   */
  avatarSeed: string | null;
}
