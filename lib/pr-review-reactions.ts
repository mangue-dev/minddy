/**
 * Emoji reactions from a review comment (MIN-139). PUR module, shared
 * client/server like `pr-review-threads`: the same vocabulary must be valid for
 * on both sides of the network AND on both sides of the forges, otherwise a 👍 posted on one
 * cannot be read on the other.
 *
 * **The canonical vocabulary is that of GitHub** (`+1`, `hooray`, …) because
 * is the SMALLER of the two: GitHub only accepts these eight reactions, where
 * GitLab awards any named emoji. Taking the broadest vocabulary
 * would have given a palette of which GitHub refuses half — the asymmetry that the
 * structuring constraint of the prohibited ticket.
 */

/** All eight reactions, in the order they appear throughout. */
export const REVIEW_REACTIONS = [
  "+1",
  "-1",
  "laugh",
  "hooray",
  "confused",
  "heart",
  "rocket",
  "eyes",
] as const;

export type ReviewReactionContent = (typeof REVIEW_REACTIONS)[number];

/** The glyph — the only part of this that the user reads. */
export const REVIEW_REACTION_EMOJI: Record<ReviewReactionContent, string> = {
  "+1": "👍",
  "-1": "👎",
  laugh: "😄",
  hooray: "🎉",
  confused: "😕",
  heart: "❤️",
  rocket: "🚀",
  eyes: "👀",
};

/**
 * GitLab name of each reaction (“award emoji”). Written HERE, pasted to name
 * GitHub, because a divergence between the two tables is ONLY seen when
 * they are next to each other — and would otherwise read as a reaction that disappears
 * when changing forge.
 */
export const GITLAB_AWARD_NAMES: Record<ReviewReactionContent, string> = {
  "+1": "thumbsup",
  "-1": "thumbsdown",
  laugh: "laughing",
  hooray: "tada",
  confused: "confused",
  heart: "heart",
  rocket: "rocket",
  eyes: "eyes",
};

const BY_GITLAB_NAME = new Map<string, ReviewReactionContent>(
  REVIEW_REACTIONS.map((content) => [GITLAB_AWARD_NAMES[content], content]),
);

/**
 * GitLab Award → canonical reaction, or `null`. GitLab awards the entire alphabet
 * emoji: what the palette cannot display, we do not count it rather than
 * aggregating it under a glyph which would not be the right one.
 */
export function reactionFromGitlabName(name: string): ReviewReactionContent | null {
  return BY_GITLAB_NAME.get(name) ?? null;
}

/** Border guard: what comes from a request is not typed, it is checked. */
export function isReviewReactionContent(value: unknown): value is ReviewReactionContent {
  return typeof value === "string" && (REVIEW_REACTIONS as readonly string[]).includes(value);
}

/**
 * The BODY of the pull request, seen as one more comment (MIN-147).
 *
 * It opens the thread and renders exactly like the other messages: GitHub y
 * lets react, and not letting react would read like a failure ("why
 * all messages except the first?). But this is NOT a comment, and
 * both forges address it elsewhere — `issues/{n}/reactions` at GitHub,
 * `merge_requests/{iid}/award_emoji` at GitLab. Hence this zero: no
 * comment carries it, and it goes through the entire chain (payload, grouping,
 * buttons) without any layer needing a second field.
 */
export const PR_BODY_COMMENT_ID = 0;

/**
 * A reaction, aggregated by (comment, emoji) — never by person: the two
 * forges do not name their reactors the same way, and this is the ACCOUNT that
 * the UI displays.
 *
 * `mine` = ME, the connected human, have already reacted (MIN-145): the reaction leaves
 * from the person's git account on BOTH forges, and the server only turns on this
 * boolean for her. It is not read in the data, it is deduced from the
 * token which READS — hence `viewerIsActor` on the forge side: without a connected git account the
 * reading falls on the installation token, and `mine` is then worth `false`
 * everywhere rather than sparking a reaction in everyone that no one has asked for.
 * The `count` is the same for everyone. It is this boolean that the
 * toggles inversely, and it is this that the button reflects.
 */
export interface ReviewCommentReaction {
  commentId: number;
  content: ReviewReactionContent;
  count: number;
  mine: boolean;
}

/**
 * Reactions indexed by comment, each in CANONICAL ORDER: the forges
 * render their groups in a variable order, and a 👍 which changes place
 * between two refreshes clicks crooked.
 *
 * A group with zero is discarded: GitHub keeps the group from a removed reaction
 * right after the removal, and displaying it would return an emoji that no one has posted anymore.
 */
export function groupReactionsByComment(
  reactions: ReviewCommentReaction[],
): Map<number, ReviewCommentReaction[]> {
  const rank = new Map<string, number>(REVIEW_REACTIONS.map((c, i) => [c, i]));
  const byComment = new Map<number, ReviewCommentReaction[]>();
  for (const reaction of reactions) {
    if (reaction.count <= 0) continue;
    const list = byComment.get(reaction.commentId);
    if (list) list.push(reaction);
    else byComment.set(reaction.commentId, [reaction]);
  }
  for (const list of byComment.values()) {
    list.sort((a, b) => (rank.get(a.content) ?? 0) - (rank.get(b.content) ?? 0));
  }
  return byComment;
}
