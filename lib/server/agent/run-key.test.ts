import { describe, expect, it } from "vitest";

import { runKeyCapUsd } from "./run-key";

/**
 * Le plafond de la clé de run tient DEUX budgets qui n'ont pas le même statut.
 *
 * Celui du RUN est un gouverneur : la boucle s'arrête dessus en le disant, et la
 * clé le double d'une marge pour que ce soit toujours notre message que
 * l'utilisateur lise, jamais un 402 d'API.
 *
 * Celui du COMPTE est un plafond DUR. Il ne se multiplie pas : au-delà, on ferait
 * dépenser un argent qui n'existe pas. C'est ce que l'ancienne version accordait —
 * elle multipliait le `min` des deux, plancher compris, si bien qu'un utilisateur
 * à 3 $ de reste et sans budget de run (le cas COURANT) recevait une clé à 4,50 $.
 */

describe("runKeyCapUsd", () => {
  it("sans budget de run, la clé vaut EXACTEMENT ce qui reste au compte", () => {
    // Le cas courant — un run lancé à la main n'a pas de `budget_usd`. La marge
    // n'a rien à mordre ici : ce restant-là est le budget inclus du plan, pas une
    // consigne de l'utilisateur qu'on pourrait dépasser d'un cheveu.
    expect(runKeyCapUsd({ accountRemainingUsd: 3 })).toBe(3);
    expect(runKeyCapUsd({ accountRemainingUsd: 0.4 })).toBe(0.4);
  });

  it("prend le plus serré des deux, et le compte a le DERNIER mot", () => {
    // Le compte a 10 $, le run 2 $ : c'est le budget du run qui borne, marge comprise.
    expect(runKeyCapUsd({ runBudgetUsd: 2, accountRemainingUsd: 10 })).toBe(3);
    // L'inverse : la marge du run ne peut pas franchir ce que le compte a encore.
    // (l'ancienne version rendait 3 $ ici, pour 2 $ réellement disponibles)
    expect(runKeyCapUsd({ runBudgetUsd: 10, accountRemainingUsd: 2 })).toBe(2);
  });

  it("déduit ce que le run a déjà dépensé", () => {
    // Un plafond qui ne déduirait pas se rechargerait à chaque reprise.
    expect(runKeyCapUsd({ runBudgetUsd: 2, runSpentUsd: 1.5 })).toBe(0.75);
  });

  it("le plancher couvre le round qui déborde — mais jamais au-delà du compte", () => {
    // Budget de run épuisé, le compte a encore de quoi : le plancher évite une clé
    // morte, et donc un 402 illisible là où la boucle sait dire « budget atteint ».
    expect(runKeyCapUsd({ runBudgetUsd: 2, runSpentUsd: 2, accountRemainingUsd: 5 })).toBe(0.25);
    // Compte à sec : le plancher ne s'applique pas. Une clé à 0 $ est le résultat
    // JUSTE — la boucle, qui oppose le même restant à sa dépense, n'appellera de
    // toute façon pas le modèle (`budget_exhausted` avant le premier round).
    expect(runKeyCapUsd({ runBudgetUsd: 0, accountRemainingUsd: 0 })).toBe(0);
    expect(runKeyCapUsd({ accountRemainingUsd: 0.1 })).toBe(0.1);
  });

  it("laisse une marge au-dessus du budget DU RUN : c'est la boucle qui arrête", () => {
    const budget = 4;
    expect(runKeyCapUsd({ runBudgetUsd: budget })).toBeGreaterThan(budget);
  });

  it("reste borné quand le restant du compte est inconnu (quota injoignable)", () => {
    // La boucle est alors sans plafond elle aussi : cette clé est le seul garde-fou
    // du passage. On ne rend PAS l'infini — c'est ce que ce module existe pour
    // éviter — mais assez pour qu'un run ordinaire (0,07 à 0,24 $) aboutisse.
    const cap = runKeyCapUsd({});
    expect(Number.isFinite(cap)).toBe(true);
    expect(cap).toBeGreaterThan(0.25);
  });
});
