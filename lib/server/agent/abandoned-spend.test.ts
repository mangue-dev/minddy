import { describe, expect, it } from "vitest";
import { abandonedSpend, type AbandonedStream } from "./abandoned-spend";
import type { NormalizedUsage } from "@/lib/server/ai-usage-shape";

/**
 * MIN-216 — ce qu'on écrit au ledger pour un essai de stream ABANDONNÉ.
 *
 * Ce que ça coûtait de ne rien écrire : l'objet `usage` d'OpenRouter n'arrive
 * qu'au dernier chunk du flux, et la ligne `ai_usage` ne s'écrivait qu'au retour
 * complet de l'appel. Un « Stop », un flux coupé, un essai remplacé par une
 * reprise : le fournisseur avait facturé, et la dépense n'entrait ni dans le
 * quota du compte, ni dans le plafond du run, ni dans la facture.
 */

/** Un `usage` normalisé complet — les champs non dits restent à `null`. */
const usage = (over: Partial<NormalizedUsage> = {}): NormalizedUsage => ({
  promptTokens: null,
  completionTokens: null,
  totalTokens: null,
  cost: null,
  cachedTokens: null,
  cacheWriteTokens: null,
  ...over,
});

const attempt = (over: Partial<AbandonedStream> = {}): AbandonedStream => ({
  generationId: "gen_1",
  modelUsed: "test/model",
  usage: usage(),
  estimatedPromptTokens: 20_000,
  estimatedCompletionTokens: 500,
  ...over,
});

const pricing = { inputUsdPerMTok: 3, outputUsdPerMTok: 15 };

describe("abandonedSpend", () => {
  it("estime au prix publié quand le fournisseur n'a pas eu le temps de rendre son usage", () => {
    const spent = abandonedSpend(attempt(), pricing);

    // 20 000 tokens d'entrée à 3 $/Mtok + 500 de sortie à 15 $/Mtok.
    expect(spent.cost).toBeCloseTo(0.06 + 0.0075, 6);
    expect(spent.promptTokens).toBe(20_000);
    expect(spent.completionTokens).toBe(500);
    expect(spent.totalTokens).toBe(20_500);
    // Le marqueur qui empêche l'admin finance de lire ce calcul comme un relevé.
    expect(spent.estimated).toBe(true);
  });

  it("préfère le coût RAPPORTÉ quand le dernier chunk est arrivé avant la coupure", () => {
    const spent = abandonedSpend(
      attempt({
        usage: usage({ promptTokens: 18_000, completionTokens: 400, totalTokens: 18_400, cost: 0.042 }),
      }),
      pricing,
    );

    expect(spent.cost).toBe(0.042);
    expect(spent.promptTokens).toBe(18_000);
    // Une facture, pas une estimation : la ligne ne se marque pas.
    expect(spent.estimated).toBe(false);
  });

  it("rend un coût NUL (pas zéro) quand le prix du modèle est inconnu", () => {
    const spent = abandonedSpend(attempt(), null);

    // Zéro se lirait « cet appel était gratuit » et rechargerait le plafond :
    // c'est exactement le trou qu'on rebouche. Les tokens et l'id de génération
    // restent, de quoi retrouver la dépense chez le fournisseur.
    expect(spent.cost).toBeNull();
    expect(spent.promptTokens).toBe(20_000);
    expect(spent.estimated).toBe(true);
  });

  it("prend les tokens rapportés quand ils sont là, l'estimation quand ils manquent", () => {
    // Cas d'un provider qui streame `usage` sans comptabilité de coût (BYOK
    // OpenAI) : les tokens sont vrais, le coût reste à calculer.
    const spent = abandonedSpend(
      attempt({
        usage: usage({ promptTokens: 12_345 }),
      }),
      pricing,
    );

    expect(spent.promptTokens).toBe(12_345);
    expect(spent.completionTokens).toBe(500);
    expect(spent.totalTokens).toBe(12_845);
    expect(spent.cost).toBeCloseTo((12_345 / 1e6) * 3 + (500 / 1e6) * 15, 6);
    expect(spent.estimated).toBe(true);
  });

  it("ne laisse pas passer un compte de tokens absurde", () => {
    const spent = abandonedSpend(
      attempt({ estimatedPromptTokens: Number.NaN, estimatedCompletionTokens: -10 }),
      pricing,
    );

    expect(spent.promptTokens).toBe(0);
    expect(spent.completionTokens).toBe(0);
    expect(spent.cost).toBe(0);
  });
});
