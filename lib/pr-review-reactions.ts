/**
 * Réactions emoji d'un commentaire de review (MIN-139). Module PUR, partagé
 * client/serveur comme `pr-review-threads` : le même vocabulaire doit valoir des
 * deux côtés du réseau ET des deux côtés des forges, sinon un 👍 posté sur l'une
 * ne se relit pas sur l'autre.
 *
 * **Le vocabulaire canonique est celui de GitHub** (`+1`, `hooray`, …) parce que
 * c'est le plus PETIT des deux : GitHub n'accepte que ces huit réactions, là où
 * GitLab décerne n'importe quel emoji nommé. Prendre le vocabulaire le plus large
 * aurait donné une palette dont GitHub refuse la moitié — l'asymétrie que la
 * contrainte structurante du ticket interdit.
 */

/** Les huit réactions, dans l'ordre où elles s'affichent partout. */
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

/** Le glyphe — la seule part de tout ceci que l'utilisateur lit. */
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
 * Nom GitLab de chaque réaction (« award emoji »). Écrit ICI, collé au nom
 * GitHub, parce qu'une divergence entre les deux tables ne se voit QUE quand
 * elles sont côte à côte — et se lirait sinon comme une réaction qui disparaît
 * en changeant de forge.
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
 * Award GitLab → réaction canonique, ou `null`. GitLab décerne tout l'alphabet
 * emoji : ce que la palette ne sait pas afficher, on ne le compte pas plutôt que
 * de l'agréger sous un glyphe qui ne serait pas le bon.
 */
export function reactionFromGitlabName(name: string): ReviewReactionContent | null {
  return BY_GITLAB_NAME.get(name) ?? null;
}

/** Garde de frontière : ce qui arrive d'une requête n'est pas typé, il est vérifié. */
export function isReviewReactionContent(value: unknown): value is ReviewReactionContent {
  return typeof value === "string" && (REVIEW_REACTIONS as readonly string[]).includes(value);
}

/**
 * Une réaction, agrégée par (commentaire, emoji) — jamais par personne : les deux
 * forges ne nomment pas leurs réacteurs de la même façon, et c'est le COMPTE que
 * l'UI affiche.
 *
 * `mine` = l'identité avec laquelle minddy parle a déjà réagi. Cette identité
 * n'est pas la même des deux côtés — le bot de l'App GitHub, le compte connecté
 * côté GitLab — et c'est une vraie limite, pas un détail : sur GitHub, deux
 * membres du même projet partagent une seule réaction. C'est ce booléen que la
 * bascule inverse, et c'est lui que le bouton reflète.
 */
export interface ReviewCommentReaction {
  commentId: number;
  content: ReviewReactionContent;
  count: number;
  mine: boolean;
}

/**
 * Réactions indexées par commentaire, chacune dans l'ORDRE CANONIQUE : les forges
 * rendent leurs groupes dans un ordre variable, et un 👍 qui change de place
 * entre deux rafraîchissements se clique de travers.
 *
 * Un groupe à zéro est écarté : GitHub garde le groupe d'une réaction retirée
 * juste après le retrait, et l'afficher rendrait un emoji que plus personne n'a
 * posé.
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
