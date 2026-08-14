import { describe, expect, it } from "vitest";

import {
  checkUsageClaim,
  maxPlausibleCostUsd,
  MAX_USAGE_COST_USD,
  MAX_USAGE_TOKENS,
} from "./usage-claim";

/**
 * MIN-329 — ce que la microVM annonce avoir dépensé n'est pas ce qu'on écrit.
 *
 * Le ticket part d'un `cost` négatif : la ligne de ledger faisait DESCENDRE la
 * consommation du mois, et le plafond de dépense sautait pour tout le compte. Ces
 * tests tiennent les deux moitiés de la réponse — les bornes (signe, finitude,
 * plafond dur) et le plafond CALCULÉ à partir des tokens et du tarif du modèle.
 */

/** deepseek-v4-flash, ordre de grandeur : entrée $0,30/Mtok, sortie $1,20/Mtok. */
const PRICE = {
  pricing: { inputUsdPerMTok: 0.3, outputUsdPerMTok: 1.2 },
  cachePricing: { readUsdPerMTok: 0.03, writeUsdPerMTok: 0.375 },
};

const claim = (over: Record<string, unknown> = {}) => ({
  promptTokens: 100_000,
  completionTokens: 10_000,
  totalTokens: 110_000,
  cost: 0.042,
  ...over,
});

describe("les bornes du montant", () => {
  it("REFUSE un montant négatif — c'est le ticket", () => {
    // Un montant négatif n'annule pas une dépense : il en efface d'autres. Le
    // refus est net, pas un `Math.max(0, …)` silencieux.
    const v = checkUsageClaim(claim({ cost: -1000 }), PRICE);
    expect(v.ok).toBe(false);
  });

  it("refuse NaN et Infinity plutôt que de les traiter comme une absence", () => {
    // `null` est légitime (le fournisseur n'a rien rapporté) ; NaN est un mensonge.
    expect(checkUsageClaim(claim({ cost: Number.NaN }), PRICE).ok).toBe(false);
    expect(checkUsageClaim(claim({ cost: Number.POSITIVE_INFINITY }), PRICE).ok).toBe(false);
  });

  it("refuse un montant démesuré même sans tarif connu", () => {
    const v = checkUsageClaim(claim({ cost: MAX_USAGE_COST_USD + 1 }), null);
    expect(v.ok).toBe(false);
  });

  it("accepte l'absence de montant : le fournisseur n'en rapporte pas toujours", () => {
    const v = checkUsageClaim(claim({ cost: null }), PRICE);
    expect(v).toMatchObject({ ok: true, cost: null, estimated: false });
  });

  it("refuse un compteur de tokens négatif ou délirant", () => {
    expect(checkUsageClaim(claim({ promptTokens: -5 }), PRICE).ok).toBe(false);
    expect(
      checkUsageClaim(claim({ completionTokens: MAX_USAGE_TOKENS + 1 }), PRICE).ok,
    ).toBe(false);
    // …et un compteur impossible n'est pas une absence : sans ce refus, la ligne
    // passerait avec un compteur en moins, donc un plafond calculé plus bas.
    expect(checkUsageClaim(claim({ totalTokens: Number.NaN }), PRICE).ok).toBe(false);
  });
});

describe("le plafond calculé sur les tokens", () => {
  it("laisse passer un montant plausible, tel qu'il a été rapporté", () => {
    // 100k entrée + 10k sortie ≈ 0,042 $ : la valeur du fournisseur EST la
    // facture (remises de cache comprises), on ne la remplace pas par la nôtre.
    const v = checkUsageClaim(claim(), PRICE);
    expect(v).toMatchObject({ ok: true, cost: 0.042, estimated: false });
    expect(v).not.toHaveProperty("clampedFrom");
  });

  it("coupe un montant que les tokens ne peuvent pas justifier", () => {
    const v = checkUsageClaim(claim({ cost: 40 }), PRICE);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    // Le chiffre écrit est le NÔTRE, et il se dit calculé : l'admin finance ne
    // doit jamais confondre un montant calculé avec un montant relevé.
    expect(v.cost).toBe(maxPlausibleCostUsd(v, PRICE));
    expect(v.estimated).toBe(true);
    expect(v.clampedFrom).toBe(40);
  });

  it("ne plafonne pas les lignes minuscules, où la tolérance ne mesure rien", () => {
    // 1 token de sortie « coûte » 0,0000012 $ : sans plancher, le moindre frais
    // fixe du fournisseur ferait couper une ligne parfaitement honnête.
    const v = checkUsageClaim(
      { promptTokens: 0, completionTokens: 1, totalTokens: 1, cost: 0.02 },
      PRICE,
    );
    expect(v).toMatchObject({ ok: true, cost: 0.02, estimated: false });
  });

  it("sans tarif connu (BYOK, modèle hors catalogue), seules les bornes dures jouent", () => {
    const v = checkUsageClaim(claim({ cost: 12 }), null);
    expect(v).toMatchObject({ ok: true, cost: 12 });
  });

  it("refuse un montant SANS tokens plutôt que de l'écrire à zéro", () => {
    // Les deux issues seraient mauvaises : plafonner écrirait 0 sur une ligne
    // honnête, ne pas plafonner offrirait le plein plafond dur à qui omet ses
    // compteurs. Un relevé de fournisseur porte toujours ses tokens.
    const v = checkUsageClaim({ cost: 5 }, PRICE);
    expect(v.ok).toBe(false);
  });

  it("…mais laisse passer une ligne minuscule sans tokens : rien à voler là", () => {
    expect(checkUsageClaim({ cost: 0.01 }, PRICE)).toMatchObject({ ok: true, cost: 0.01 });
  });
});

describe("le majorant lui-même", () => {
  it("compte l'écriture de cache, et au plus cher des deux tarifs", () => {
    const withWrite = maxPlausibleCostUsd(
      {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cachedTokens: null,
        cacheWriteTokens: 1_000_000,
      },
      PRICE,
    );
    // 0,375 $/Mtok en écriture > 0,30 $/Mtok en entrée.
    expect(withWrite).toBe(0.375);
  });

  it("rend null quand le prix du modèle est inconnu — on ne devine pas un tarif", () => {
    expect(
      maxPlausibleCostUsd(
        {
          promptTokens: 1,
          completionTokens: 1,
          totalTokens: 2,
          cachedTokens: null,
          cacheWriteTokens: null,
        },
        { pricing: null, cachePricing: null },
      ),
    ).toBeNull();
  });
});
