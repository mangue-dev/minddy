import { describe, expect, it } from "vitest";

import {
  byokModelsForProvider,
  byokProviderFromConfigKey,
  isByokCatalogProvider,
} from "./byok-model-catalog";

const INDEX = [
  { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", router: false, textOutput: true, outputModalities: ["text"] },
  // Dated snapshot of the bare id above → deduplicated away.
  { id: "anthropic/claude-sonnet-5-20260114", name: "Claude Sonnet 5 (snapshot)", router: false, textOutput: true },
  // Deferred-rate variant → deduplicated away.
  { id: "anthropic/claude-haiku-4.5:batch", name: "Claude Haiku 4.5 (batch)", router: false, textOutput: true },
  { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5", router: false, textOutput: true },
  // Embedding → excluded from a chat picker.
  { id: "openai/text-embedding-3-small", name: "OpenAI Embedding", router: false, textOutput: false, outputModalities: ["embeddings"] },
  { id: "openai/whisper-large-v3", name: "Whisper", router: false, textOutput: false, outputModalities: ["transcription"] },
  { id: "openai/gpt-5.6-sol", name: "GPT-5.6 Sol", router: false, textOutput: true },
  { id: "google/gemini-3.5-flash", name: "Gemini 3.5 Flash", router: false, textOutput: true },
  // Image output → excluded even though it declares itself textual.
  { id: "google/gemini-3-pro-image", name: "Gemini 3 Pro Image", router: false, textOutput: true },
  // Other vendors → ignored entirely.
  { id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash", router: false, textOutput: true },
];

describe("byokModelsForProvider", () => {
  it("strips the vendor prefix and keeps only that vendor's models", () => {
    const models = byokModelsForProvider(INDEX, "anthropic");
    expect(models.map((m) => m.id)).toEqual(["claude-haiku-4.5", "claude-sonnet-5"]);
    expect(models[1].name).toBe("Claude Sonnet 5");
  });

  it("drops routers, non-text output and non-chat ids", () => {
    const withNoise = [
      ...INDEX,
      { id: "openrouter/auto", name: "Auto Router", router: true, textOutput: true },
      { id: "~openai/latest", name: "Latest alias", router: true, textOutput: true },
      { id: "openai/whisper-large-v3", name: "Whisper", router: false, textOutput: true },
    ];
    expect(byokModelsForProvider(withNoise, "openai").map((m) => m.id)).toEqual([
      "gpt-5.6-sol",
    ]);
  });

  it("returns an empty list when the vendor has no entry", () => {
    expect(byokModelsForProvider(INDEX.filter((m) => !m.id.startsWith("google/")), "google")).toEqual(
      [],
    );
  });

  it("returns only models matching a non-text capability", () => {
    expect(byokModelsForProvider(INDEX, "openai", "transcription").map((m) => m.id)).toEqual([
      "whisper-large-v3",
    ]);
    expect(byokModelsForProvider(INDEX, "openai", "embedding").map((m) => m.id)).toEqual([
      "text-embedding-3-small",
    ]);
  });
});

describe("byokProviderFromConfigKey", () => {
  it("reads the border-default key shape", () => {
    expect(byokProviderFromConfigKey("byok_default_model_anthropic")).toBe("anthropic");
  });

  it("reads the per-feature key shape", () => {
    expect(byokProviderFromConfigKey("byok_default_openai_agent_model")).toBe("openai");
    expect(byokProviderFromConfigKey("byok_default_google_transcription_model")).toBe("google");
  });

  it("splits on the longest model key, not a suffix of another", () => {
    // `automation_agent_model` ends in `agent_model`: the longest wins.
    expect(byokProviderFromConfigKey("byok_default_google_automation_agent_model")).toBe("google");
  });

  it("returns null for non-BYOK or non-catalog keys", () => {
    expect(byokProviderFromConfigKey("agent_model")).toBeNull();
    expect(byokProviderFromConfigKey("byok_default_model_generic")).toBeNull();
    expect(byokProviderFromConfigKey("byok_default_generic_agent_model")).toBeNull();
  });
});

describe("isByokCatalogProvider", () => {
  it("accepts the three catalog providers only", () => {
    expect(isByokCatalogProvider("openai")).toBe(true);
    expect(isByokCatalogProvider("anthropic")).toBe(true);
    expect(isByokCatalogProvider("google")).toBe(true);
    expect(isByokCatalogProvider("openrouter")).toBe(false);
    expect(isByokCatalogProvider(null)).toBe(false);
  });
});
