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
 * MIN-139 : les réactions traversent deux forges qui ne les nomment pas pareil et
 * un réseau. Tout ce qui suit garde une seule chose : qu'un 👍 posé quelque part
 * reste un 👍 partout.
 */
describe("vocabulaire des réactions", () => {
  it("nomme et dessine les huit réactions, sans trou ni doublon", () => {
    expect(REVIEW_REACTIONS).toHaveLength(8);
    expect(new Set(REVIEW_REACTIONS).size).toBe(8);
    for (const content of REVIEW_REACTIONS) {
      expect(REVIEW_REACTION_EMOJI[content]).toBeTruthy();
      expect(GITLAB_AWARD_NAMES[content]).toBeTruthy();
    }
    // Deux réactions GitHub qui tomberaient sur le même award GitLab en
    // fusionneraient les comptes — le genre de faute qu'on ne voit qu'en prod.
    expect(new Set(Object.values(GITLAB_AWARD_NAMES)).size).toBe(8);
  });

  it("fait l'aller-retour GitHub ↔ GitLab sans perte", () => {
    for (const content of REVIEW_REACTIONS) {
      expect(reactionFromGitlabName(GITLAB_AWARD_NAMES[content])).toBe(content);
    }
  });

  it("ignore un award que la palette ne sait pas afficher", () => {
    // GitLab décerne tout l'alphabet emoji ; le compter sous un mauvais glyphe
    // serait pire que ne pas le compter.
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
    // Les forges rendent leurs groupes dans un ordre variable : un 👍 qui change
    // de place entre deux rafraîchissements se clique de travers.
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
