import { describe, expect, it } from "vitest";
import { isPrReviewActive, PR_REVIEW_STALE_MS, type PrReviewRun } from "./pr-review-run";

/**
 * Le maillon qui décide si la carte vivante de Numo s'affiche.
 *
 * Il compte depuis MIN-162 : quand un commentaire mentionne `@numo`, la route
 * ouvre la session AVANT de répondre et la renvoie dans sa réponse, précisément
 * pour que l'écran la montre TOUT DE SUITE. Si une session fraîchement créée ne
 * se lisait pas comme active, on retomberait sur le symptôme d'origine — une
 * minute de silence pendant laquelle rien ne dit que le geste a marché.
 */
const run = (over: Partial<PrReviewRun> = {}): PrReviewRun =>
  ({
    id: "run-1",
    status: "running",
    createdAt: new Date().toISOString(),
    ...over,
  }) as PrReviewRun;

describe("isPrReviewActive", () => {
  it("une session tout juste ouverte est active — la carte s'affiche aussitôt", () => {
    expect(isPrReviewActive(run())).toBe(true);
  });

  it("le reste tant que la passe tourne", () => {
    const at = Date.now();
    expect(
      isPrReviewActive(run({ createdAt: new Date(at - PR_REVIEW_STALE_MS + 1000).toISOString() }), at),
    ).toBe(true);
  });

  it("cesse de l'être quand elle est périmée — une passe morte ne bloque pas la suivante", () => {
    const at = Date.now();
    expect(
      isPrReviewActive(run({ createdAt: new Date(at - PR_REVIEW_STALE_MS - 1000).toISOString() }), at),
    ).toBe(false);
  });

  it("une passe finie ou en échec n'est plus active", () => {
    expect(isPrReviewActive(run({ status: "done" }))).toBe(false);
    expect(isPrReviewActive(run({ status: "failed" }))).toBe(false);
  });

  it("aucune session : rien à montrer", () => {
    expect(isPrReviewActive(null)).toBe(false);
  });
});
