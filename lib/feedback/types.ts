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

/**
 * Ce qui est encore vivant : ouvert, prévu, en cours. Le complément exact de
 * `FEEDBACK_RESOLVED_STATUSES` parmi les statuts publics — et le point de départ
 * du board. Un visiteur y vient pour voter sur ce qui peut encore bouger ; lui
 * ouvrir l'archive de tout ce qui est tranché, c'est lui faire chercher la
 * matière votable au milieu de ce sur quoi son vote ne changera plus rien.
 */
export const FEEDBACK_OPEN_STATUSES: readonly FeedbackPostStatus[] =
  FEEDBACK_PUBLIC_STATUSES.filter((status) => !FEEDBACK_RESOLVED_STATUSES.includes(status));

/**
 * Le filtre d'état du board public, tel qu'il vit dans l'URL :
 * - `null` (paramètre absent) — le défaut, les retours encore vivants ;
 * - `"all"` — tout ce qui est public, résolus compris ;
 * - un statut — celui-là seul.
 *
 * Le défaut est l'ABSENCE de paramètre, et pas une valeur nommée : une URL de
 * board partagée reste l'URL du board, et un lien `?status=planned` d'avant ce
 * groupement continue de dire exactement ce qu'il disait.
 */
export type PublicStatusFilter = FeedbackPostStatus | "all" | null;

/** Les statuts qu'un filtre laisse passer — `null` = aucune restriction. */
export function publicFilterStatuses(
  filter: PublicStatusFilter
): readonly FeedbackPostStatus[] | null {
  if (filter === "all") return null;
  return filter === null ? FEEDBACK_OPEN_STATUSES : [filter];
}

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
 * Ce qu'une dictée de retour peut toucher : le titre et le corps, rien d'autre.
 *
 * La visibilité (« rendre public ») reste au clavier, délibérément — c'est le
 * seul choix du composeur qui engage la personne, et il vient d'être expliqué
 * juste au-dessus. Le laisser à la voix, c'est laisser un modèle décider de la
 * publication de quelqu'un sur un malentendu. Même raison pour l'auteur du
 * modal interne : c'est au NOM DE QUI on écrit, et ça ne se devine pas.
 */
export interface FeedbackVoiceDraft {
  title: string;
  body: string;
}

export type FeedbackVoicePatch = Partial<FeedbackVoiceDraft>;

/** Un tour de la conversation de dictée — jetable, jamais persisté. */
export interface FeedbackVoiceTurn {
  role: "user" | "assistant";
  content: string;
}

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

/**
 * Post tel que rendu sur le board public (anonymisé).
 *
 * Il portait ses catégories : elles ne sortent plus côté public. Le classement
 * d'un retour est une lecture d'ÉQUIPE — ce qu'elle en fait, pas ce qu'il est —
 * et un visiteur n'a rien à en tirer : il vient dire un besoin et voter. Le
 * réglage `show_categories` du board reste en place pour le MCP et les
 * intégrations, il ne pilote simplement plus de rendu public.
 */
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
