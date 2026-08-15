import { describe, expect, it } from "vitest";

import { billingReturnUrl } from "./return-url";
import { DESKTOP_RETURN_PATH } from "./config";

/**
 * MIN-362 — le patron `<module>.ts` / `<module>.test.ts` de `lib/desktop/`, tenu
 * jusqu'au bout (cf. [local-surface-coverage.test.ts](../server/agent/local-surface-coverage.test.ts)).
 *
 * Ce qui se garde ici n'est pas la concaténation, c'est le CHEMIN DE RETOUR :
 * depuis l'app de bureau, une URL de tiers doit revenir sur la page de rebond,
 * qui rouvre l'app — y renvoyer directement laisserait l'utilisateur dans son
 * navigateur, sa session terminée dans une fenêtre qu'il n'a pas ouverte.
 */
describe("billingReturnUrl", () => {
  it("depuis le web, renvoie sur la page elle-même", () => {
    expect(billingReturnUrl("https://minddy.app", "/settings/billing", false)).toBe(
      "https://minddy.app/settings/billing",
    );
  });

  it("depuis l'app de bureau, passe par le rebond, avec la destination encodée", () => {
    expect(billingReturnUrl("https://minddy.app", "/settings/billing?tab=plan", true)).toBe(
      `https://minddy.app${DESKTOP_RETURN_PATH}?next=${encodeURIComponent("/settings/billing?tab=plan")}`,
    );
  });
});
