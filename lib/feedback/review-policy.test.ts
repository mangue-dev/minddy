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
  return { source: "board", isPublic: true, reviewState: "pending", ...over };
}

function decide(v: FeedbackReviewVerdict, p: FeedbackReviewSubject) {
  return decideFeedbackReview({
    verdict: v,
    post: p,
    autoThreshold: AUTO,
    suggestFloor: FLOOR,
  });
}

describe("resolveFeedbackReviewMode — les deux réglages projet", () => {
  const mode = (
    reviewEnabled: boolean,
    hasBudget: boolean,
    skipOverBudget: boolean
  ) => resolveFeedbackReviewMode({ reviewEnabled, hasBudget, skipOverBudget });

  it("revoit par défaut : revue armée et budget disponible", () => {
    expect(mode(true, true, false)).toBe("review");
  });

  it("publie sans revue quand le owner l'a désarmée", () => {
    expect(mode(false, true, false)).toBe("publish");
  });

  it("retient quand le budget est épuisé et que la bascule n'est pas demandée", () => {
    expect(mode(true, false, false)).toBe("hold");
  });

  it("publie sans revue quand le budget est épuisé et la bascule demandée", () => {
    expect(mode(true, false, true)).toBe("publish");
  });

  it("la bascule budget n'a aucun effet tant que le budget tient", () => {
    expect(mode(true, true, true)).toBe("review");
  });

  it("revue désarmée : le budget ne change plus rien", () => {
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

  it("ne rétrograde pas un post déjà publié par l'équipe", () => {
    const d = decide(verdict({ isJunk: true }), subject({ reviewState: "published" }));
    expect(d.reviewState).toBe("published");
  });

  it("ne ressuscite pas un post rejeté par l'équipe", () => {
    const d = decide(verdict(), subject({ reviewState: "rejected" }));
    expect(d.reviewState).toBe("rejected");
  });
});

describe("decideFeedbackReview — junk", () => {
  it("rejette un junk en attente", () => {
    const d = decide(verdict({ isJunk: true, reason: "spam publicitaire" }), subject());
    expect(d.reviewState).toBe("rejected");
    expect(d.moderationReason).toBe("spam publicitaire");
  });

  it("ne fusionne jamais un junk, même très proche d'un post existant", () => {
    const d = decide(
      verdict({ isJunk: true, duplicateOf: "canonical", confidence: 0.99 }),
      subject()
    );
    expect(d.mergeTargetId).toBeNull();
    expect(d.suggestTargetId).toBeNull();
  });

  it("ne catégorise pas un junk", () => {
    const d = decide(verdict({ isJunk: true, categoryIds: ["cat-1"] }), subject());
    expect(d.categoryIds).toEqual([]);
  });
});

describe("decideFeedbackReview — contenu sensible", () => {
  it("force en privé un post public sensible et retient sa nature", () => {
    const d = decide(
      verdict({ isSensitive: true, sensitivityKind: "security", reason: "XSS exploitable" }),
      subject()
    );
    expect(d.forcePrivate).toBe(true);
    expect(d.sensitivity).toBe("security");
    expect(d.moderationReason).toBe("XSS exploitable");
  });

  it("retombe sur `other` quand le modèle ne qualifie pas la sensibilité", () => {
    const d = decide(verdict({ isSensitive: true, sensitivityKind: null }), subject());
    expect(d.sensitivity).toBe("other");
  });

  it("ne privatise pas la saisie interne de l'équipe", () => {
    const d = decide(
      verdict({ isSensitive: true, sensitivityKind: "legal" }),
      subject({ source: "internal", reviewState: "published" })
    );
    expect(d.forcePrivate).toBe(false);
    expect(d.sensitivity).toBe("legal");
  });

  it("ne re-privatise pas un post déjà privé", () => {
    const d = decide(verdict({ isSensitive: true }), subject({ isPublic: false }));
    expect(d.forcePrivate).toBe(false);
  });

  it("dégrade une fusion certaine en simple suggestion", () => {
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

  it("suggère entre le plancher et le seuil", () => {
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

  it("ne catégorise pas un post qui part en fusion", () => {
    const d = decide(
      verdict({ duplicateOf: "canonical", confidence: 0.97, categoryIds: ["cat-1"] }),
      subject()
    );
    expect(d.mergeTargetId).toBe("canonical");
    expect(d.categoryIds).toEqual([]);
  });

  it("catégorise un post seulement suggéré", () => {
    const d = decide(
      verdict({ duplicateOf: "canonical", confidence: 0.7, categoryIds: ["cat-1"] }),
      subject()
    );
    expect(d.categoryIds).toEqual(["cat-1"]);
  });
});
