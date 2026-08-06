import { describe, expect, it } from "vitest";
import { formatModelName, providerFromModel } from "./model-display";

/**
 * L'affichage d'un id de modèle OpenRouter (MIN-46). Ce qui se vérifie ici est
 * la casse : elle ne se déduit pas d'une règle unique, parce que les marques ne
 * la suivent pas. Un token « lettres + numéro » se capitalise (« kimi-k3 » se
 * lit « Kimi K3 »), sauf la famille de raisonnement d'OpenAI, que son éditeur
 * écrit en minuscule. Vérifié contre les 400 ids de l'index OpenRouter.
 */

describe("formatModelName — casse des tokens de version", () => {
  it("capitalise les lettres qui précèdent un numéro", () => {
    expect(formatModelName("moonshotai/kimi-k3")).toBe("Kimi K3");
    expect(formatModelName("moonshotai/kimi-k2.7-code")).toBe("Kimi K2.7 Code");
    expect(formatModelName("qwen/qwen3-32b")).toBe("Qwen3 32b");
    expect(formatModelName("deepseek/deepseek-r1")).toBe("DeepSeek R1");
  });

  it("garde le « v » de version en majuscule", () => {
    expect(formatModelName("deepseek/deepseek-v3.2")).toBe("DeepSeek V3.2");
  });

  it("laisse en minuscule la famille o<N> d'OpenAI, qui s'écrit ainsi", () => {
    expect(formatModelName("openai/o3")).toBe("o3");
    expect(formatModelName("openai/o3-pro")).toBe("o3 Pro");
    expect(formatModelName("openai/o4-mini-high")).toBe("o4 Mini High");
  });

  it("laisse intact un token qui COMMENCE par un chiffre", () => {
    // Le « 4o » de GPT-4o, le « 70b » d'un Llama : capitaliser n'a pas de sens,
    // il n'y a pas de lettre initiale à toucher.
    expect(formatModelName("openai/gpt-4o")).toBe("GPT 4o");
    expect(formatModelName("google/gemini-2.5-flash")).toBe("Gemini 2.5 Flash");
  });
});

describe("formatModelName — le reste du contrat", () => {
  it("préfère le libellé curaté de l'allowlist au formatage automatique", () => {
    expect(formatModelName("deepseek/deepseek-v4-flash")).toBe("DeepSeek V4 Flash");
    expect(formatModelName("anthropic/claude-sonnet-5")).toBe("Claude Sonnet 5");
  });

  it("retire les suffixes de variante OpenRouter", () => {
    expect(formatModelName("moonshotai/kimi-k3:batch")).toBe("Kimi K3");
    expect(formatModelName("deepseek/deepseek-v4-flash:free")).toBe("DeepSeek V4 Flash");
  });

  it("corrige la casse des acronymes", () => {
    expect(formatModelName("openai/gpt-5.6-luna")).toBe("GPT 5.6 Luna");
    expect(formatModelName("z-ai/glm-4.6")).toBe("GLM 4.6");
  });

  it("rend une chaîne vide sur une absence de modèle", () => {
    expect(formatModelName(null)).toBe("");
    expect(formatModelName(undefined)).toBe("");
  });
});

describe("providerFromModel", () => {
  it("normalise les slugs qui divergent de @lobehub/icons", () => {
    expect(providerFromModel("moonshotai/kimi-k3")).toBe("moonshot");
    expect(providerFromModel("z-ai/glm-4.6")).toBe("zhipu");
    expect(providerFromModel("x-ai/grok-4")).toBe("xai");
  });

  it("rend le slug tel quel quand il coïncide", () => {
    expect(providerFromModel("openai/gpt-5.6-luna")).toBe("openai");
    expect(providerFromModel("anthropic/claude-sonnet-5")).toBe("anthropic");
  });

  it("rend une chaîne vide sur une absence de modèle", () => {
    expect(providerFromModel(null)).toBe("");
  });
});
