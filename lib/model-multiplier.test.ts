import { describe, expect, it } from "vitest";
import {
  formatMultiplier,
  isMultiplierWithinPlan,
  modelCostMultiplier,
  roundMultiplier,
  type ModelPricing,
} from "./model-multiplier";

/**
 * Le multiplicateur affiché dans le picker de modèle, et le plafond de plan qui
 * s'appuie dessus. Ce qui compte ici : que l'écran et le serveur tranchent
 * IDENTIQUEMENT — un modèle montré comme autorisé qui se ferait refuser au
 * lancement serait pire que pas de multiplicateur du tout.
 */

const priced = (input: number, output: number): ModelPricing => ({
  inputUsdPerMTok: input,
  outputUsdPerMTok: output,
});

/** Le défaut de minddy du moment : moyenne 1 USD/Mtok — l'origine de l'échelle. */
const BASELINE = priced(0.5, 1.5);

describe("modelCostMultiplier", () => {
  it("situe le baseline à ×1, quel que soit son prix", () => {
    expect(modelCostMultiplier(BASELINE, BASELINE)).toBe(1);
    expect(modelCostMultiplier(priced(30, 60), priced(30, 60))).toBe(1);
  });

  it("moyenne l'entrée et la sortie", () => {
    // (3 + 15) / 2 = 9, contre 1 pour le baseline.
    expect(modelCostMultiplier(priced(3, 15), BASELINE)).toBe(9);
  });

  it("descend sous 1 pour un modèle moins cher", () => {
    expect(modelCostMultiplier(priced(0.1, 0.3), BASELINE)).toBe(0.2);
  });

  it("rend null quand il ne veut rien dire", () => {
    // Prix inconnus (provider BYOK, modèle hors index) ou baseline gratuit : on
    // ne fabrique pas un chiffre, et l'appelant n'interdit rien là-dessus.
    expect(modelCostMultiplier(null, BASELINE)).toBeNull();
    expect(modelCostMultiplier(BASELINE, null)).toBeNull();
    expect(modelCostMultiplier(BASELINE, priced(0, 0))).toBeNull();
  });
});

describe("roundMultiplier", () => {
  it("s'arrondit plus grossièrement à mesure qu'il grandit", () => {
    expect(roundMultiplier(12.4)).toBe(12);
    expect(roundMultiplier(2.44)).toBe(2.4);
    expect(roundMultiplier(0.043)).toBe(0.04);
  });

  it("est la SEULE valeur en circulation : l'affichage et le plafond la partagent", () => {
    // Le cas qui motive l'arrondi canonique : ×1,549 s'écrit « ×1,5 », donc dans
    // le plafond Free — et doit donc AUSSI passer le contrôle du serveur.
    const shown = modelCostMultiplier(priced(1.549, 1.549), BASELINE);
    expect(shown).toBe(1.5);
    expect(isMultiplierWithinPlan(shown, 1.5)).toBe(true);
  });
});

describe("isMultiplierWithinPlan", () => {
  it("accepte l'égalité stricte au plafond", () => {
    expect(isMultiplierWithinPlan(4, 4)).toBe(true);
    expect(isMultiplierWithinPlan(4.1, 4)).toBe(false);
  });

  it("laisse passer ce qu'on ne sait pas situer", () => {
    // On ne refuse jamais sur une ignorance : le budget d'usage reste derrière.
    expect(isMultiplierWithinPlan(null, 1.5)).toBe(true);
    expect(isMultiplierWithinPlan(undefined, 1.5)).toBe(true);
  });
});

describe("formatMultiplier", () => {
  it("suit la locale pour la décimale", () => {
    expect(formatMultiplier(1.5, "fr")).toBe("×1,5");
    expect(formatMultiplier(1.5, "en")).toBe("×1.5");
  });

  it("n'écrit pas de décimale inutile", () => {
    expect(formatMultiplier(1, "en")).toBe("×1");
    expect(formatMultiplier(12, "fr")).toBe("×12");
  });
});
