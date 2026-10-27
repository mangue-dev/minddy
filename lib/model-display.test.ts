import { describe, expect, it } from "vitest";
import { formatModelName, providerFromModel } from "./model-display";

/**
 * Displaying an OpenRouter model id (MIN-46). What is true here is
 * the case: it cannot be deduced from a single rule, because the marks do not
 * follow it. A “letters + number” token is capitalized (“kimi-k3” se
 * reads “Kimi K3”), except for the OpenAI reasoning family, which its publisher
 * writes in lowercase. Checked against the 400 ids in the OpenRouter index.
 */

describe("formatModelName — version token casing", () => {
  it("capitalizes the letters before a number", () => {
    expect(formatModelName("moonshotai/kimi-k3")).toBe("Kimi K3");
    expect(formatModelName("moonshotai/kimi-k2.7-code")).toBe("Kimi K2.7 Code");
    expect(formatModelName("qwen/qwen3-32b")).toBe("Qwen3 32b");
    expect(formatModelName("deepseek/deepseek-r1")).toBe("DeepSeek R1");
  });

  it("keeps the version \"v\" uppercase", () => {
    expect(formatModelName("deepseek/deepseek-v3.2")).toBe("DeepSeek V3.2");
  });

  it("keeps the OpenAI o<N> family lowercase, as it is written", () => {
    expect(formatModelName("openai/o3")).toBe("o3");
    expect(formatModelName("openai/o3-pro")).toBe("o3 Pro");
    expect(formatModelName("openai/o4-mini-high")).toBe("o4 Mini High");
  });

  it("leaves a token that STARTS with a digit untouched", () => {
    // The “4o” of GPT-4o, the “70b” of a Llama: capitalizing makes no sense,
    // there is no initial letter to touch.
    expect(formatModelName("openai/gpt-4o")).toBe("GPT 4o");
    expect(formatModelName("google/gemini-2.5-flash")).toBe("Gemini 2.5 Flash");
  });
});

describe("formatModelName — hyphenated versions (MIN-834)", () => {
  it("rejoins the dotted version of native Anthropic ids", () => {
    expect(formatModelName("claude-opus-5-5")).toBe("Claude Opus 5.5");
    expect(formatModelName("claude-haiku-5-5")).toBe("Claude Haiku 5.5");
    expect(formatModelName("claude-fable-5-1")).toBe("Claude Fable 5.1");
    expect(formatModelName("claude-opus-4-6")).toBe("Claude Opus 4.6");
  });

  it("keeps a date suffix as a separate, unaltered word", () => {
    expect(formatModelName("claude-opus-4-5-20251101")).toBe("Claude Opus 4.5 20251101");
    expect(formatModelName("claude-haiku-4-5-20251001")).toBe("Claude Haiku 4.5 20251001");
  });

  it("names a model the same whether the id is native or from OpenRouter", () => {
    expect(formatModelName("claude-opus-5-5")).toBe(formatModelName("anthropic/claude-opus-5.5"));
    expect(formatModelName("anthropic/claude-opus-5.5")).toBe("Claude Opus 5.5");
  });

  it("leaves sizes and other numbers apart", () => {
    expect(formatModelName("claude-sonnet-5")).toBe("Claude Sonnet 5");
    expect(formatModelName("openai/gpt-4-0613")).toBe("GPT 4 0613");
    expect(formatModelName("meta-llama/llama-3-70b-instruct")).toBe("Llama 3 70b Instruct");
  });
});

describe("formatModelName — the rest of the contract", () => {
  it("prefers the curated allowlist label over automatic formatting", () => {
    expect(formatModelName("deepseek/deepseek-v4-flash")).toBe("DeepSeek V4 Flash");
    expect(formatModelName("anthropic/claude-sonnet-5")).toBe("Claude Sonnet 5");
  });

  it("removes OpenRouter variant suffixes", () => {
    expect(formatModelName("moonshotai/kimi-k3:batch")).toBe("Kimi K3");
    expect(formatModelName("deepseek/deepseek-v4-flash:free")).toBe("DeepSeek V4 Flash");
  });

  it("fixes acronym casing", () => {
    expect(formatModelName("openai/gpt-5.6-luna")).toBe("GPT 5.6 Luna");
    expect(formatModelName("z-ai/glm-4.6")).toBe("GLM 4.6");
  });

  it("returns an empty string without a model", () => {
    expect(formatModelName(null)).toBe("");
    expect(formatModelName(undefined)).toBe("");
  });
});

describe("providerFromModel", () => {
  it("normalizes slugs that diverge from @lobehub/icons", () => {
    expect(providerFromModel("moonshotai/kimi-k3")).toBe("moonshot");
    expect(providerFromModel("z-ai/glm-4.6")).toBe("zhipu");
    expect(providerFromModel("x-ai/grok-4")).toBe("xai");
  });

  it("returns the slug unchanged when it matches", () => {
    expect(providerFromModel("openai/gpt-5.6-luna")).toBe("openai");
    expect(providerFromModel("anthropic/claude-sonnet-5")).toBe("anthropic");
  });

  it("returns an empty string without a model", () => {
    expect(providerFromModel(null)).toBe("");
  });
});
