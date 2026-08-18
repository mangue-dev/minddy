import { describe, expect, it } from "vitest";

import {
  checkUsageClaim,
  maxPlausibleCostUsd,
  MAX_USAGE_COST_USD,
  MAX_USAGE_TOKENS,
} from "./usage-claim";

/**
 * MIN-329 — what the microVM announces having spent is not what we write.
 *
 * The ticket starts from a negative `cost`: the ledger line brought down the
 * consumption of the month, and the spending ceiling jumped for the entire account. These
 * tests hold both halves of the answer — the bounds (sign, finiteness,
 * hard ceiling) and the ceiling CALCULATED from the tokens and the model price.
 */

/** deepseek-v4-flash, order of magnitude: input $0.30/Mtok, output $1.20/Mtok. */
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
    // A negative amount does not cancel an expense: it erases others. THE
    // reject is clear, not a silent `Math.max(0, …)`.
    const v = checkUsageClaim(claim({ cost: -1000 }), PRICE);
    expect(v.ok).toBe(false);
  });

  it("refuse NaN et Infinity plutôt que de les traiter comme une absence", () => {
    // `null` is legitimate (the provider has not reported anything); NaN is a lie.
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
    // …and an impossible counter is not an absence: without this refusal, the line
    // would pass with one meter less, therefore a lower calculated ceiling.
    expect(checkUsageClaim(claim({ totalTokens: Number.NaN }), PRICE).ok).toBe(false);
  });
});

describe("le plafond calculé sur les tokens", () => {
  it("laisse passer un montant plausible, tel qu'il a été rapporté", () => {
    // 100k input + 10k output ≈ $0.042: the provider value IS the
    // invoice (cache discounts included), we do not replace it with ours.
    const v = checkUsageClaim(claim(), PRICE);
    expect(v).toMatchObject({ ok: true, cost: 0.042, estimated: false });
    expect(v).not.toHaveProperty("clampedFrom");
  });

  it("coupe un montant que les tokens ne peuvent pas justifier", () => {
    const v = checkUsageClaim(claim({ cost: 40 }), PRICE);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    // The written figure is OURS, and it is said to be calculated: the finance admin does not
    // must never confuse a calculated amount with a recorded amount.
    expect(v.cost).toBe(maxPlausibleCostUsd(v, PRICE));
    expect(v.estimated).toBe(true);
    expect(v.clampedFrom).toBe(40);
  });

  it("ne plafonne pas les lignes minuscules, où la tolérance ne mesure rien", () => {
    // 1 exit token “costs” $0.0000012: no floor, no fees
    // fixed from the provider would cut a perfectly honest line.
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
    // Both outcomes would be bad: capping would write 0 on a line
    // honest, not capping would offer the full hard ceiling to those who omit their
    // counters. A supplier statement always carries its tokens.
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
    // $0.375/Mtok in writing > $0.30/Mtok in input.
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
