import { describe, expect, it } from "vitest";

import { runKeyCapUsd } from "./run-key";

/**
 * Le plafond de la clé de run est un FILET, pas le gouverneur : c'est la boucle
 * qui arrête un run sur son budget, avec un message lisible. Ce que ces tests
 * gardent, c'est cette hiérarchie — un plafond serré à l'euro près ferait gagner
 * la course au fournisseur, et l'utilisateur lirait un 402 d'API là où il devait
 * lire « budget atteint ».
 */

describe("runKeyCapUsd", () => {
  it("prend le plus serré des deux plafonds, avec la marge", () => {
    // Le compte a 10 $, le run 2 $ : c'est 2 $ qui borne.
    expect(runKeyCapUsd({ runBudgetUsd: 2, accountRemainingUsd: 10 })).toBe(3);
    // …et l'inverse.
    expect(runKeyCapUsd({ runBudgetUsd: 10, accountRemainingUsd: 2 })).toBe(3);
  });

  it("déduit ce que le run a déjà dépensé", () => {
    // Un plafond qui ne déduirait pas se rechargerait à chaque reprise.
    expect(runKeyCapUsd({ runBudgetUsd: 2, runSpentUsd: 1.5 })).toBe(0.75);
  });

  it("reste au-dessus du plancher — une clé à 0 $ meurt sur un 402 illisible", () => {
    expect(runKeyCapUsd({ runBudgetUsd: 2, runSpentUsd: 2 })).toBe(0.25);
    expect(runKeyCapUsd({ runBudgetUsd: 0, accountRemainingUsd: 0 })).toBe(0.25);
  });

  it("laisse une marge au-dessus du budget : c'est la boucle qui arrête, pas OpenRouter", () => {
    const budget = 4;
    expect(runKeyCapUsd({ runBudgetUsd: budget })).toBeGreaterThan(budget);
  });

  it("reste borné quand personne ne dit rien (BYOK illimité déguisé)", () => {
    // Aucun plafond connu : on ne rend PAS l'infini — une clé sans limite est
    // exactement ce que ce module existe pour éviter.
    const cap = runKeyCapUsd({});
    expect(Number.isFinite(cap)).toBe(true);
    expect(cap).toBeGreaterThan(0);
  });
});
