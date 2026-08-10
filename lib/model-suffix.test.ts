import { describe, expect, it } from "vitest";
import {
  AI_MODEL_CONFIG_FIELDS,
  AI_MODEL_CONFIG_KEYS,
  AI_MODEL_SUFFIX_KEYS,
  applyModelSuffix,
  getAiConfigField,
  isModelSuffix,
  isModelSuffixKey,
  isSuffixableField,
  MODEL_SUFFIXES,
  modelSuffixKey,
  stripModelSuffix,
} from "@/lib/ai-model-config";

/**
 * Les raccourcis de routage OpenRouter (MIN-263). Rien d'IO ici : le collage
 * d'un suffixe est une règle de chaîne, et c'est là qu'elle se vérifie.
 */

describe("applyModelSuffix", () => {
  it("colle le raccourci demandé", () => {
    expect(applyModelSuffix("deepseek/deepseek-v4-flash", "nitro")).toBe(
      "deepseek/deepseek-v4-flash:nitro",
    );
  });

  it("ne touche à rien sans raccourci", () => {
    for (const suffix of [null, undefined, "", "   "]) {
      expect(applyModelSuffix("openai/gpt-5", suffix)).toBe("openai/gpt-5");
    }
  });

  it("ignore un raccourci inconnu plutôt que d'envoyer un id cassé", () => {
    // Une ligne `app_config` écrite à la main passe à côté de la validation de
    // l'API : elle ne doit pas suffire à faire refuser tous les appels.
    expect(applyModelSuffix("openai/gpt-5", "nirto")).toBe("openai/gpt-5");
    expect(applyModelSuffix("openai/gpt-5", "online")).toBe("openai/gpt-5");
  });

  it("laisse une variante saisie à la main tranquille", () => {
    // `…:free` est un CHOIX de modèle, pas un ordre de routage — et
    // `…:free:nitro` n'existe pas.
    expect(applyModelSuffix("qwen/qwen3-coder:free", "nitro")).toBe("qwen/qwen3-coder:free");
  });

  it("nettoie l'id avant de coller", () => {
    expect(applyModelSuffix("  openai/gpt-5  ", "  floor  ")).toBe("openai/gpt-5:floor");
  });
});

describe("stripModelSuffix", () => {
  it("rend l'id nu", () => {
    expect(stripModelSuffix("anthropic/claude-sonnet-5:exacto")).toBe("anthropic/claude-sonnet-5");
  });

  it("est neutre sur un id déjà nu", () => {
    expect(stripModelSuffix("anthropic/claude-sonnet-5")).toBe("anthropic/claude-sonnet-5");
  });

  it("annule applyModelSuffix", () => {
    for (const suffix of MODEL_SUFFIXES) {
      expect(stripModelSuffix(applyModelSuffix("openai/gpt-5", suffix))).toBe("openai/gpt-5");
    }
  });
});

describe("isModelSuffix", () => {
  it("reconnaît les trois raccourcis offerts, et rien d'autre", () => {
    for (const suffix of MODEL_SUFFIXES) expect(isModelSuffix(suffix)).toBe(true);
    // `:online` existe chez OpenRouter mais n'est délibérément PAS offert : il
    // allumerait la recherche web payante sur n'importe quel appel.
    expect(isModelSuffix("online")).toBe(false);
    expect(isModelSuffix("")).toBe(false);
  });
});

describe("registre", () => {
  it("dérive une clé de suffixe par champ de modèle suffixable", () => {
    const expected = AI_MODEL_CONFIG_FIELDS.filter(isSuffixableField).map((f) =>
      modelSuffixKey(f.key),
    );
    expect(AI_MODEL_SUFFIX_KEYS).toEqual(expected);
    expect(AI_MODEL_SUFFIX_KEYS.length).toBeGreaterThan(0);
  });

  it("n'offre de suffixe qu'à des champs `model`", () => {
    for (const key of AI_MODEL_SUFFIX_KEYS) {
      const field = getAiConfigField(key.replace(/_suffix$/, ""));
      expect(field?.kind).toBe("model");
    }
  });

  it("laisse l'agent de code et la review de PR hors du dispositif", () => {
    // Leur modèle est écrit sur la ligne `agent_runs` et retourne pendant des
    // dizaines de rounds : le repli « rejouer sans le `:` » n'y tient pas.
    for (const key of ["agent_model", "pr_review_model"]) {
      expect(isModelSuffixKey(modelSuffixKey(key))).toBe(false);
      expect(AI_MODEL_CONFIG_KEYS.has(modelSuffixKey(key))).toBe(false);
    }
  });

  it("rend les clés de suffixe écrivables par l'API admin", () => {
    for (const key of AI_MODEL_SUFFIX_KEYS) {
      expect(AI_MODEL_CONFIG_KEYS.has(key)).toBe(true);
      expect(isModelSuffixKey(key)).toBe(true);
    }
  });

  it("ne prend pas une clé de modèle pour une clé de suffixe", () => {
    expect(isModelSuffixKey("assistant_model")).toBe(false);
    expect(isModelSuffixKey("byok_default_model_openai_suffix")).toBe(false);
  });
});
