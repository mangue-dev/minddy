import { describe, expect, it } from "vitest";
import { formatModelName, providerFromModel } from "./model-display";

/**
 * Displaying an OpenRouter model id (MIN-46). What is true here is
 * the case: it cannot be deduced from a single rule, because the marks do not
 * follow it. A “letters + number” token is capitalized (“kimi-k3” se
 * reads “Kimi K3”), except for the OpenAI reasoning family, which its publisher
 * writes in lowercase. Checked against the 400 ids in the OpenRouter index.
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
    // The “4o” of GPT-4o, the “70b” of a Llama: capitalizing makes no sense,
    // there is no initial letter to touch.
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
