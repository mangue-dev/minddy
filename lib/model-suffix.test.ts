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
 * OpenRouter routing shortcuts (MIN-263). Nothing IO here: pasting
 * of a suffix is ​​a chain rule, and that's where it checks.
 */

describe("applyModelSuffix", () => {
  it("appends the requested shortcut", () => {
    expect(applyModelSuffix("deepseek/deepseek-v4-flash", "nitro")).toBe(
      "deepseek/deepseek-v4-flash:nitro",
    );
  });

  it("does nothing without a shortcut", () => {
    for (const suffix of [null, undefined, "", "   "]) {
      expect(applyModelSuffix("openai/gpt-5", suffix)).toBe("openai/gpt-5");
    }
  });

  it("ignores an unknown shortcut instead of sending a broken id", () => {
    // A handwritten `app_config` line misses the validation of
    // the API: it should not be enough to refuse all calls.
    expect(applyModelSuffix("openai/gpt-5", "nirto")).toBe("openai/gpt-5");
    expect(applyModelSuffix("openai/gpt-5", "online")).toBe("openai/gpt-5");
  });

  it("leaves a manually entered variant alone", () => {
    // `…:free` is a pattern CHOICE, not a routing order — and
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

  it("is neutral for an already bare id", () => {
    expect(stripModelSuffix("anthropic/claude-sonnet-5")).toBe("anthropic/claude-sonnet-5");
  });

  it("annule applyModelSuffix", () => {
    for (const suffix of MODEL_SUFFIXES) {
      expect(stripModelSuffix(applyModelSuffix("openai/gpt-5", suffix))).toBe("openai/gpt-5");
    }
  });

  it("does not touch a model variant", () => {
    // `…:free` denotes another template, not a routing order. Cut it
    // would replay a refusal on the PAID variant, without saying anything — and
    // `applyModelSuffix` never pastes a shortcut on such an id.
    for (const model of ["qwen/qwen3-coder:free", "anthropic/claude-sonnet-5:thinking"]) {
      expect(stripModelSuffix(model)).toBe(model);
    }
  });
});

describe("isModelSuffix", () => {
  it("recognizes the three offered shortcuts and nothing else", () => {
    for (const suffix of MODEL_SUFFIXES) expect(isModelSuffix(suffix)).toBe(true);
    // `:online` exists at OpenRouter but is deliberately NOT offered: it
    // would turn on paid web search on any call.
    expect(isModelSuffix("online")).toBe(false);
    expect(isModelSuffix("")).toBe(false);
  });
});

describe("registre", () => {
  it("derives a suffix key for each suffixable model field", () => {
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
    // Their model is written on the `agent_runs` line and returns for
    // dozens of rounds: the fallback “play again without the `:`” does not hold up.
    for (const key of ["agent_model", "pr_review_model"]) {
      expect(isModelSuffixKey(modelSuffixKey(key))).toBe(false);
      expect(AI_MODEL_CONFIG_KEYS.has(modelSuffixKey(key))).toBe(false);
    }
  });

  it("makes suffix keys writable by the admin API", () => {
    for (const key of AI_MODEL_SUFFIX_KEYS) {
      expect(AI_MODEL_CONFIG_KEYS.has(key)).toBe(true);
      expect(isModelSuffixKey(key)).toBe(true);
    }
  });

  it("does not treat a model key as a suffix key", () => {
    expect(isModelSuffixKey("assistant_model")).toBe(false);
    expect(isModelSuffixKey("byok_default_model_openai_suffix")).toBe(false);
  });
});
