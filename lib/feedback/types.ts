import type { IssueStatus } from "@/lib/issue-constants";

/**
 * Public Feedback Shared Types (MIN-37) — client-side importable as
 * server side (no "server-only" here). Public shapes are
 * anonymized: never email or real name on the board side.
 */

/**
 * States of a return. `spam` is part of it like the others — it’s a
 * decision on the return, not a parallel axis, and the team places it where it
 * pose all the others. It NEVER appears on the public board.
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

/**
 * Public status → equivalent issue status, to borrow the icon
 * Linear-style des tickets (`StatusIndicator`).
 *
 * It lives HERE, in the shared module, and not in the bricks of the public board:
 * four surfaces make it — the board, the board selector, the team view,
 * and the “Relationships” section of a ticket — and the last one is on the way
 * chaud du tableau. L'y faire importer un composant du board public tirerait
 * the entire public in the app bundle for a table of six entries.
 */
export const FEEDBACK_TO_ISSUE_STATUS: Record<FeedbackPostStatus, IssueStatus> = {
  open: "backlog",
  planned: "todo",
  in_progress: "in_progress",
  shipped: "done",
  declined: "canceled",
  // Spam has no equivalent in tickets: it borrows the icon of the
  // ticket canceled for places that ONLY display the indicator (the
  // status selector), but the badge is painted with its own sign.
  spam: "canceled",
};

export function isFeedbackPostStatus(value: unknown): value is FeedbackPostStatus {
  return (
    typeof value === "string" &&
    (FEEDBACK_POST_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * What the public board knows how to name. Spam is neither listed nor filterable:
 * offering the filter would amount to announcing to visitors that there is a
 * hidden returns category, and the filter would never return anything.
 */
export const FEEDBACK_PUBLIC_STATUSES: readonly FeedbackPostStatus[] =
  FEEDBACK_POST_STATUSES.filter((status) => status !== "spam");

/** A return outside the public board — today the only case is spam. */
export function isHiddenFeedbackStatus(status: FeedbackPostStatus): boolean {
  return status === "spam";
}

/**
 * “Completed” statuses: a requirement delivered (shipped), refused (declined) or rejected
 * (spam) is resolved and no longer has to occupy the top of the lists. They are stored in
 * bottom, public board like team tab.
 */
export const FEEDBACK_RESOLVED_STATUSES: readonly FeedbackPostStatus[] = [
  "shipped",
  "declined",
  "spam",
];

/**
 * What is still alive: open, planned, in progress. The exact complement of
 * `FEEDBACK_RESOLVED_STATUSES` among public statuses — and the starting point
 * of the board. A visitor comes there to vote on what can still move; him
 * opening the archive of everything that is decided is to make him search for the
 * votable matter in the middle of that on which his vote will no longer change anything.
 */
export const FEEDBACK_OPEN_STATUSES: readonly FeedbackPostStatus[] =
  FEEDBACK_PUBLIC_STATUSES.filter((status) => !FEEDBACK_RESOLVED_STATUSES.includes(status));

/**
 * The public board status filter, as it lives in the URL:
 * - `null` (parameter absent) — the fault, the returns still alive;
 * - `"all"` — everything that is public, including resolved;
 * - a status — that one alone.
 *
 * The default is the ABSENCE of a parameter, and not a named value: a URL of
 * shared board remains the URL of the board, and a `?status=planned` link from before
 * groupement continue de dire exactement ce qu'il disait.
 */
export type PublicStatusFilter = FeedbackPostStatus | "all" | null;

/** The statuses that a filter lets pass — `null` = no restrictions. */
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
 * Pushes resolved feedback down without breaking the order already applied
 * (votes/date): partition stable — Array.prototype.sort is stable in modern JS.
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

/** Post bounds, applied to creation (lib/server/feedback/posts.ts) and
    ANNOUNCED to agents by the integration contract (lib/feedback/integration-contract.ts):
    they therefore live here, pure, rather than in the core server. */
export const FEEDBACK_TITLE_MAX = 200;
export const FEEDBACK_BODY_MAX = 10_000;

/**
 * What a return dictation can affect: the title and the body, nothing else.
 *
 * Visibility (“making public”) remains on the keyboard, deliberately — this is the
 * only choice of the composer who engages the person, and it has just been explained
 * just above. Leaving it to the voice is letting a model decide the
 * someone's post about a misunderstanding. Same reason for the author of
 * internal modal: it is in WHOSE NAME we write, and that cannot be guessed.
 */
export interface FeedbackVoiceDraft {
  title: string;
  body: string;
}

export type FeedbackVoicePatch = Partial<FeedbackVoiceDraft>;

/** A trick of dictation conversation — disposable, never persisted. */
export interface FeedbackVoiceTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * PUBLICATION status of a post (MIN-54), distinct from the choice of visibility
 * `is_public` from the author. `pending` = waiting for the IA review (categorization
 * + moderation), invisible from the board even if public; `published` = verified, listed
 * si public.
 *
 * It carried a third status, `rejected`, for the junk detected by the magazine.
 * It was a second way of excluding a return, alongside one's status, and
 * the team had to look for it somewhere other than where they read everything else:
 * it became status `spam`. Only the queue remains here.
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
 * Nature of sensitivity detected by AI (MIN-54). Not exhaustive on the model side:
 * validated applicationally, `other` serves as a catch-all. Null = not sensitive.
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
 * Post as made on the public board (anonymized).
 *
 * He carried his categories: they no longer come out publicly. The ranking
 * of a return is a TEAM reading — what she makes of it, not what it is —
 * and a visitor has nothing to gain from it: he comes to express a need and vote. THE
 * `show_categories` setting of the board remains in place for the MCP and
 * integrations, it simply no longer drives public release.
 */
export interface PublicPost {
  id: string;
  title: string;
  body: string;
  status: FeedbackPostStatus;
  /** false = private feedback: reported to the team but absent from the public board. */
  isPublic: boolean;
  /** Publication status (MIN-54). On the public board always `published`;
      informative on “my feedback” (the author sees his pending posts). */
  reviewState: FeedbackReviewState;
  voteCount: number;
  createdAt: string;
  authorPseudonym: string | null;
  isMine: boolean;
  votedByMe: boolean;
  /** Number of PUBLIC comments in the thread (including team replies). */
  commentCount: number;
  /** Date of the team's last public comment — the "The team has
      answered » from the board reads on it, without loading the wires. */
  teamRepliedAt: string | null;
}

/**
 * Visibility of a feedback comment (MIN-196). Ticket threads and
 * objectives are internal by construction; only returns have both.
 */
export const COMMENT_VISIBILITIES = ["internal", "public"] as const;
export type CommentVisibility = (typeof COMMENT_VISIBILITIES)[number];

export function isCommentVisibility(value: unknown): value is CommentVisibility {
  return (
    typeof value === "string" &&
    (COMMENT_VISIBILITIES as readonly string[]).includes(value)
  );
}

/** Borne d'un commentaire public — plus courte que celle d'un retour : on y
    specifies a case, we do not write a second return there. */
export const FEEDBACK_COMMENT_BODY_MAX = 5_000;

/**
 * A comment from the public thread, as the board makes it — anonymized HERE, at the
 * source, comme `PublicPost`.
 *
 * `authorSeed` is the PSEUDONYM of who wrote, and nothing else: it is not used
 * than sowing an avatar. Neither name nor email comes out, and the pseudonym itself
 * never appears — the avatar is the only trace of it, and two comments from
 * the same person have the same face. Null + `isTeam` = the voice of
 * the team, signed by the project orb.
 */
export interface PublicComment {
  id: string;
  body: string;
  createdAt: string;
  authorSeed: string | null;
  /** Written by the team (or by the pre-MIN-196 team answer). */
  isTeam: boolean;
  /** Written by the visitor who reads — the only one who can delete it. */
  isMine: boolean;
  /**
   * The ROOT of the thread when this message responds to it, null when it is one.
   * Depth ≤ 1, like everywhere else in the app: we respond to a thread, not
   * to an answer. A feedback board is not a forum — a tree would cost there
   * a navigation to people who came to say one thing and vote.
   */
  parentId: string | null;
}

/**
 * The project as the public board shows it: its name and its icon.
 *
 * The two travel TOGETHER because they go together — the orb and the
 * name are both halves of "who responds", and the same pair serves as the header,
 * the “The team responded” badge and the signature of its response. Pass the only one
 * name required each surface to find the icon on its own.
 */
export interface PublicProject {
  id: string;
  name: string;
  iconUrl: string | null;
  /** Seed of the orb if the draw was restarted — otherwise `null`, and this is the id
      qui sert (`orbSeedOr`). */
  orbSeed: string | null;
}

/** Public site navigation tab (board + shared views of the project). */
export interface PublicSiteTab {
  label: string;
  href: string;
  active: boolean;
}

/** Suggestion “this post may already exist” from the public composer. */
export interface SimilarPost {
  id: string;
  title: string;
  status: FeedbackPostStatus;
  voteCount: number;
}

/** Public board side session identity. */
export interface PublicIdentity {
  pseudonym: string;
  email: string | null;
  /**
   * The avatar seed of the minddy account behind this visitor, when the SSO of the
   * board identified him — his face from the app, identically. Null otherwise
   * (OTP, SSO of another product): the avatar then falls back on the pseudonym.
   * Only used in the header, which only its owner can see.
   */
  avatarSeed: string | null;
}

/**
 * A return seen from the TICKET which implements it (MIN-196) — reading
 * inverse de `feedback_posts.issue_id`.
 *
 * Deliberately THIN: neither body, nor author, nor thread. This is what the
 * “Relationships” section of a ticket and an agent’s preamble — enough to
 * know that there is a demand behind this work and if it is worth the detour
 * (his weight in voice, if there is a conversation), and to read it at the right
 * place. The entire return is then opened with `get_feedback`.
 */
export interface IssueLinkedFeedback {
  id: string;
  title: string;
  status: FeedbackPostStatus;
  vote_count: number;
  /** false = private feedback: reported to the team, absent from the public board. */
  is_public: boolean;
  /** ALL feedback comments, public and internal combined — this is what
      what `get_feedback` renders, and the account is only used to decide to go there. */
  comment_count: number;
}
