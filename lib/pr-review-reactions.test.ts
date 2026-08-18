import { describe, expect, it } from "vitest";
import {
  GITLAB_AWARD_NAMES,
  REVIEW_REACTIONS,
  REVIEW_REACTION_EMOJI,
  groupReactionsByComment,
  isReviewReactionContent,
  reactionFromGitlabName,
  type ReviewCommentReaction,
} from "@/lib/pr-review-reactions";

/**
 * MIN-139: the reactions cross two forges which do not name them the same and
 * a network. Everything that follows keeps only one thing: that a 👍 placed somewhere
 * remains a 👍 everywhere.
 */
describe("vocabulaire des réactions", () => {
  it("nomme et dessine les huit réactions, sans trou ni doublon", () => {
    expect(REVIEW_REACTIONS).toHaveLength(8);
    expect(new Set(REVIEW_REACTIONS).size).toBe(8);
    for (const content of REVIEW_REACTIONS) {
      expect(REVIEW_REACTION_EMOJI[content]).toBeTruthy();
      expect(GITLAB_AWARD_NAMES[content]).toBeTruthy();
    }
    // Two GitHub reactions which would fall on the same GitLab award in
    // would merge the accounts — the kind of mistake you only see in production.
    expect(new Set(Object.values(GITLAB_AWARD_NAMES)).size).toBe(8);
  });

  it("fait l'aller-retour GitHub ↔ GitLab sans perte", () => {
    for (const content of REVIEW_REACTIONS) {
      expect(reactionFromGitlabName(GITLAB_AWARD_NAMES[content])).toBe(content);
    }
  });

  it("ignore un award que la palette ne sait pas afficher", () => {
    // GitLab awards the entire emoji alphabet; count it under the wrong glyph
    // would be worse than not counting it.
    expect(reactionFromGitlabName("shrug")).toBeNull();
    expect(reactionFromGitlabName("")).toBeNull();
  });

  it("refuse à la frontière ce qui n'est pas une réaction", () => {
    expect(isReviewReactionContent("+1")).toBe(true);
    expect(isReviewReactionContent("thumbsup")).toBe(false);
    expect(isReviewReactionContent(1)).toBe(false);
    expect(isReviewReactionContent(null)).toBe(false);
  });
});

describe("groupReactionsByComment", () => {
  const reaction = (over: Partial<ReviewCommentReaction> = {}): ReviewCommentReaction => ({
    commentId: 10,
    content: "+1",
    count: 1,
    mine: false,
    ...over,
  });

  it("indexe par commentaire et garde l'ordre canonique, pas celui de la forge", () => {
    // The forges render their groups in a variable order: a 👍 which changes
    // space between two refreshes clicks crooked.
    const byComment = groupReactionsByComment([
      reaction({ content: "rocket" }),
      reaction({ content: "+1", count: 3, mine: true }),
      reaction({ commentId: 20, content: "eyes" }),
    ]);
    expect([...byComment.keys()]).toEqual([10, 20]);
    expect(byComment.get(10)?.map((r) => r.content)).toEqual(["+1", "rocket"]);
    expect(byComment.get(10)?.[0].mine).toBe(true);
    expect(byComment.get(20)?.map((r) => r.content)).toEqual(["eyes"]);
  });

  it("écarte un groupe à zéro — GitHub le garde un instant après le retrait", () => {
    const byComment = groupReactionsByComment([
      reaction({ content: "heart", count: 0 }),
      reaction({ content: "+1", count: 2 }),
    ]);
    expect(byComment.get(10)?.map((r) => r.content)).toEqual(["+1"]);
  });

  it("ne rend aucune entrée pour un commentaire sans réaction", () => {
    expect(groupReactionsByComment([]).size).toBe(0);
    expect(groupReactionsByComment([reaction({ count: 0 })]).size).toBe(0);
  });
});
