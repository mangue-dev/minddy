import { describe, expect, it } from "vitest";

import {
  alternateOutputTokenBody,
  aiChatProviderHeaders,
  repairRejectedAiChatBody,
  translateAiChatRequest,
  translateLegacyAiChatBody,
} from "./ai-chat";

const base = {
  model: "model-x",
  messages: [{ role: "user", content: "Hello" }],
  maxOutputTokens: 1234,
  reasoning: { effort: "high" as const },
};

describe("translateAiChatRequest", () => {
  it("traduit OpenAI sans laisser passer le max_tokens historique", () => {
    const body = translateAiChatRequest({ ...base, stream: true }, "openai");
    expect(body).toMatchObject({
      max_completion_tokens: 1234,
      reasoning_effort: "high",
      stream_options: { include_usage: true },
    });
    expect(body).not.toHaveProperty("max_tokens");
    expect(body).not.toHaveProperty("usage");
    expect(body).not.toHaveProperty("reasoning");
  });

  it("désactive explicitement le raisonnement de GPT-5.6 avec des function tools", () => {
    const withTools = translateAiChatRequest(
      {
        ...base,
        model: "gpt-5.6-sol",
        tools: [{ type: "function", function: { name: "search" } }],
      },
      "openai",
    );
    expect(withTools.reasoning_effort).toBe("none");

    const withoutTools = translateAiChatRequest(
      { ...base, model: "gpt-5.6-sol" },
      "openai",
    );
    expect(withoutTools.reasoning_effort).toBe("high");
  });

  it("traduit OpenRouter avec ses extensions de comptage et raisonnement", () => {
    const body = translateAiChatRequest({ ...base, stream: true }, "openrouter");
    expect(body).toMatchObject({
      max_completion_tokens: 1234,
      reasoning: { effort: "high", exclude: false },
      usage: { include: true },
      stream_options: { include_usage: true },
    });
    expect(body).not.toHaveProperty("max_tokens");
    expect(body).not.toHaveProperty("reasoning_effort");
  });

  it("traduit Anthropic vers thinking, y compris via la couche compatible", () => {
    const body = translateAiChatRequest({ ...base, model: "claude-sonnet-5" }, "anthropic");
    expect(body).toMatchObject({
      max_completion_tokens: 1234,
      thinking: { type: "adaptive" },
    });
    expect(body).not.toHaveProperty("reasoning");
    expect(body).not.toHaveProperty("reasoning_effort");
  });

  it("garde les variantes Anthropic model-aware", () => {
    expect(
      translateAiChatRequest(
        { ...base, model: "claude-opus-4-6", reasoning: { effort: "medium" } },
        "anthropic",
      ),
    ).toMatchObject({ thinking: { type: "adaptive" } });
    expect(
      translateAiChatRequest(
        { ...base, model: "claude-haiku-4-5", reasoning: { effort: "low" } },
        "anthropic",
      ),
    ).toMatchObject({ thinking: { type: "enabled", budget_tokens: 1024 } });
    expect(
      translateAiChatRequest(
        { ...base, model: "claude-unknown", reasoning: { effort: "high" } },
        "anthropic",
      ),
    ).not.toHaveProperty("thinking");
    expect(
      translateAiChatRequest(
        { model: "claude-sonnet-5", messages: [], maxOutputTokens: 1234 },
        "anthropic",
      ),
    ).not.toHaveProperty("thinking");
    expect(
      translateAiChatRequest(
        { ...base, model: "claude-sonnet-5", reasoning: { effort: "off" } },
        "anthropic",
      ),
    ).toMatchObject({ thinking: { type: "disabled" } });
  });

  it("traduit Gemini vers reasoning_effort et son usage stream supporté", () => {
    const body = translateAiChatRequest({ ...base, stream: true }, "google");
    expect(body).toMatchObject({
      max_completion_tokens: 1234,
      reasoning_effort: "high",
      stream_options: { include_usage: true },
    });
    expect(body).not.toHaveProperty("usage");
  });

  it("reste conservateur sur un endpoint générique", () => {
    const body = translateAiChatRequest({ ...base, stream: true }, "generic");
    expect(body).toMatchObject({ max_tokens: 1234, stream: true });
    expect(body).not.toHaveProperty("max_completion_tokens");
    expect(body).not.toHaveProperty("reasoning");
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(body).not.toHaveProperty("stream_options");
    expect(body).not.toHaveProperty("usage");
  });

  it("exprime un budget fixe seulement là où il existe", () => {
    const request = { ...base, reasoning: { maxTokens: 2048 } };
    expect(translateAiChatRequest(request, "openrouter")).toMatchObject({
      reasoning: { max_tokens: 2048, exclude: false },
    });
    expect(
      translateAiChatRequest(
        { ...request, model: "claude-sonnet-4-6" },
        "anthropic",
      ),
    ).toMatchObject({
      // Le budget manuel doit rester strictement sous le plafond de sortie.
      thinking: { type: "enabled", budget_tokens: 1233 },
    });
    expect(translateAiChatRequest(request, "openai")).not.toHaveProperty("reasoning");
  });
});

describe("translateLegacyAiChatBody", () => {
  it("absorbe les alias d'opencode avant de les traduire", () => {
    const body = translateLegacyAiChatBody(
      {
        model: "gpt-x",
        messages: [],
        stream: true,
        max_tokens: 900,
        reasoning: { effort: "low" },
        reasoning_effort: "low",
        usage: { include: true },
      },
      "openai",
      "medium",
    );
    expect(body).toMatchObject({
      max_completion_tokens: 900,
      reasoning_effort: "medium",
      stream_options: { include_usage: true },
    });
    expect(body).not.toHaveProperty("max_tokens");
    expect(body).not.toHaveProperty("reasoning");
    expect(body).not.toHaveProperty("usage");
  });
});

describe("alternateOutputTokenBody", () => {
  it("change seulement l'alias explicitement rejeté", () => {
    expect(
      JSON.parse(
        alternateOutputTokenBody(
          JSON.stringify({ max_completion_tokens: 42, model: "x" }),
          "Unsupported parameter: max_completion_tokens",
        )!,
      ),
    ).toEqual({ max_tokens: 42, model: "x" });
    expect(
      alternateOutputTokenBody(
        JSON.stringify({ max_completion_tokens: 42 }),
        "invalid tool schema",
      ),
    ).toBeNull();
  });
});

describe("repairRejectedAiChatBody", () => {
  it("répare uniquement le rejet explicite tools + reasoning de Chat Completions", () => {
    const repaired = repairRejectedAiChatBody(
      JSON.stringify({
        model: "gpt-5.6-sol",
        tools: [{ type: "function", function: { name: "search" } }],
        reasoning_effort: "medium",
      }),
      "Function tools with reasoning_effort are not supported for gpt-5.6-sol",
    );
    expect(JSON.parse(repaired!)).toMatchObject({ reasoning_effort: "none" });
    expect(
      repairRejectedAiChatBody(
        JSON.stringify({ model: "gpt-5.6-sol", reasoning_effort: "medium" }),
        "Function tools with reasoning_effort are not supported for gpt-5.6-sol",
      ),
    ).toBeNull();
  });
});

describe("aiChatProviderHeaders", () => {
  it("n'ajoute que les en-têtes documentés par le profil", () => {
    expect(aiChatProviderHeaders("openai", "x")).toEqual({});
    expect(aiChatProviderHeaders("anthropic", "x")).toEqual({});
    expect(aiChatProviderHeaders("openrouter", "Minddy")).toMatchObject({
      "HTTP-Referer": "https://minddy.app",
      "X-Title": "Minddy",
    });
  });
});
