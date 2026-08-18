import { describe, expect, it } from "vitest";
import {
  decideFeedbackReview,
  resolveFeedbackReviewMode,
  type FeedbackReviewSubject,
  type FeedbackReviewVerdict,
} from "@/lib/feedback/review-policy";

const AUTO = 0.92;
const FLOOR = 0.6;

function verdict(over: Partial<FeedbackReviewVerdict> = {}): FeedbackReviewVerdict {
  return {
    duplicateOf: null,
    confidence: 0,
    categoryIds: [],
    isJunk: false,
    isSensitive: false,
    sensitivityKind: null,
    reason: null,
    ...over,
  };
}

function subject(over: Partial<FeedbackReviewSubject> = {}): FeedbackReviewSubject {
  return {
    source: "board",
    isPublic: true,
    reviewState: "pending",
    status: "open",
    ...over,
  };
}

function decide(v: FeedbackReviewVerdict, p: FeedbackReviewSubject) {
  return decideFeedbackReview({
    verdict: v,
    post: p,
    autoThreshold: AUTO,
    suggestFloor: FLOOR,
  });
}

describe("resolveFeedbackReviewMode — the two project settings", () => {
  const mode = (
    reviewEnabled: boolean,
    hasBudget: boolean,
    skipOverBudget: boolean
  ) => resolveFeedbackReviewMode({ reviewEnabled, hasBudget, skipOverBudget });

  it("reviews by default: review enabled and budget available", () => {
    expect(mode(true, true, false)).toBe("review");
  });

  it("publie sans revue quand le owner l'a désarmée", () => {
    expect(mode(false, true, false)).toBe("publish");
  });

  it("keeps the review when the budget is exhausted and switching is not requested", () => {
    expect(mode(true, false, false)).toBe("hold");
  });

  it("publishes without a review when the budget is exhausted and switching is requested", () => {
    expect(mode(true, false, true)).toBe("publish");
  });

  it("la bascule budget n'a aucun effet tant que le budget tient", () => {
    expect(mode(true, true, true)).toBe("review");
  });

  it("review disabled: the budget no longer changes anything", () => {
    expect(mode(false, false, false)).toBe("publish");
    expect(mode(false, false, true)).toBe("publish");
  });
});

describe("decideFeedbackReview — publication", () => {
  it("publie un post en attente qui passe la revue", () => {
    const d = decide(verdict(), subject());
    expect(d.reviewState).toBe("published");
    expect(d.forcePrivate).toBe(false);
    expect(d.sensitivity).toBeNull();
  });

  it("does not downgrade a post already published by the team", () => {
    const d = decide(verdict({ isJunk: true }), subject({ reviewState: "published" }));
    expect(d.reviewState).toBe("published");
    expect(d.markSpam).toBe(false);
  });

  it("ne ressuscite pas un post que l'équipe a écarté", () => {
    const d = decide(
      verdict({ duplicateOf: "canonical", confidence: 0.99, categoryIds: ["cat-1"] }),
      subject({ status: "spam" })
    );
    // He leaves the queue - his review has passed - but is neither
    // categorized, nor merged into a real return.
    expect(d.reviewState).toBe("published");
    expect(d.mergeTargetId).toBeNull();
    expect(d.suggestTargetId).toBeNull();
    expect(d.categoryIds).toEqual([]);
  });
});

describe("decideFeedbackReview — junk", () => {
  it("classe en spam un junk en attente", () => {
    const d = decide(verdict({ isJunk: true, reason: "spam publicitaire" }), subject());
    expect(d.markSpam).toBe(true);
    // His review has taken place: he leaves the queue in the process.
    expect(d.reviewState).toBe("published");
    expect(d.moderationReason).toBe("spam publicitaire");
  });

  it("never merges junk, even when very close to an existing post", () => {
    const d = decide(
      verdict({ isJunk: true, duplicateOf: "canonical", confidence: 0.99 }),
      subject()
    );
    expect(d.mergeTargetId).toBeNull();
    expect(d.suggestTargetId).toBeNull();
  });

  it("does not categorize junk", () => {
    const d = decide(verdict({ isJunk: true, categoryIds: ["cat-1"] }), subject());
    expect(d.categoryIds).toEqual([]);
  });
});

describe("decideFeedbackReview — contenu sensible", () => {
  it("makes a sensitive public post private and keeps its nature", () => {
    const d = decide(
      verdict({ isSensitive: true, sensitivityKind: "security", reason: "XSS exploitable" }),
      subject()
    );
    expect(d.forcePrivate).toBe(true);
    expect(d.sensitivity).toBe("security");
    expect(d.moderationReason).toBe("XSS exploitable");
  });

  it("falls back to `other` when the model does not classify sensitivity", () => {
    const d = decide(verdict({ isSensitive: true, sensitivityKind: null }), subject());
    expect(d.sensitivity).toBe("other");
  });

  it("privatise aussi la saisie interne", () => {
    // What a member enters is not what he wrote: it is the return of a
    // user, copied by hand. Personal data goes through there
    // also, and the exemption of the past published them without a net.
    const d = decide(
      verdict({ isSensitive: true, sensitivityKind: "legal" }),
      subject({ source: "internal", reviewState: "published" })
    );
    expect(d.forcePrivate).toBe(true);
    expect(d.sensitivity).toBe("legal");
  });

  it("does not make an already private post private again", () => {
    const d = decide(verdict({ isSensitive: true }), subject({ isPublic: false }));
    expect(d.forcePrivate).toBe(false);
  });

  it("downgrades a certain merge to a simple suggestion", () => {
    const d = decide(
      verdict({ isSensitive: true, duplicateOf: "canonical", confidence: 0.98 }),
      subject()
    );
    expect(d.mergeTargetId).toBeNull();
    expect(d.suggestTargetId).toBe("canonical");
    expect(d.suggestConfidence).toBe(0.98);
  });
});

describe("decideFeedbackReview — doublons", () => {
  it("fusionne au-dessus du seuil automatique", () => {
    const d = decide(verdict({ duplicateOf: "canonical", confidence: AUTO }), subject());
    expect(d.mergeTargetId).toBe("canonical");
    expect(d.suggestTargetId).toBeNull();
  });

  it("suggests between the floor and the threshold", () => {
    const d = decide(verdict({ duplicateOf: "canonical", confidence: 0.75 }), subject());
    expect(d.mergeTargetId).toBeNull();
    expect(d.suggestTargetId).toBe("canonical");
    expect(d.suggestConfidence).toBe(0.75);
  });

  it("ignore un doublon sous le plancher", () => {
    const d = decide(verdict({ duplicateOf: "canonical", confidence: 0.42 }), subject());
    expect(d.mergeTargetId).toBeNull();
    expect(d.suggestTargetId).toBeNull();
  });

  it("does not categorize a post that is being merged", () => {
    const d = decide(
      verdict({ duplicateOf: "canonical", confidence: 0.97, categoryIds: ["cat-1"] }),
      subject()
    );
    expect(d.mergeTargetId).toBe("canonical");
    expect(d.categoryIds).toEqual([]);
  });

  it("categorizes a merely suggested post", () => {
    const d = decide(
      verdict({ duplicateOf: "canonical", confidence: 0.7, categoryIds: ["cat-1"] }),
      subject()
    );
    expect(d.categoryIds).toEqual(["cat-1"]);
  });
});
