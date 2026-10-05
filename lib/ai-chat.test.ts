import { describe, expect, it } from "vitest";

import {
  alternateOutputTokenBody,
  aiChatProviderHeaders,
  repairRejectedAiChatBody,
  translateAiChatRequest,
  translateLegacyAiChatBody,
} from "./ai-chat";
import { SITE_URL } from "./site";

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

  it("explicitly disables GPT-5.6 reasoning with function tools", () => {
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

  it("translates OpenRouter with its counting and reasoning extensions", () => {
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
    // Fable 5 / Mythos 5 / Mythos Preview refusent `thinking: {type: "disabled"}`
    // (400): “off” does not send ANY fields, the model keeps its default.
    for (const model of [
      "claude-fable-5",
      "claude-mythos-5",
      "claude-mythos-preview",
    ]) {
      expect(
        translateAiChatRequest(
          { ...base, model, reasoning: { effort: "off" } },
          "anthropic",
        ),
      ).not.toHaveProperty("thinking");
    }
    // Opus 5 and Sonnet 5 still accept deactivation.
    expect(
      translateAiChatRequest(
        { ...base, model: "claude-opus-5", reasoning: { effort: "off" } },
        "anthropic",
      ),
    ).toMatchObject({ thinking: { type: "disabled" } });
  });

  it("keeps Claude 5.5 families on their default when reasoning is off", () => {
    // Claude Opus 5.5 / Sonnet 5.5 reject `thinking: {type: "disabled"}` with
    // a 400 (Anthropic thinking page, per-model table): "off" sends nothing,
    // the model keeps its always-on adaptive thinking.
    for (const model of ["claude-opus-5-5", "claude-sonnet-5-5"]) {
      expect(
        translateAiChatRequest(
          { ...base, model, reasoning: { effort: "off" } },
          "anthropic",
        ),
      ).not.toHaveProperty("thinking");
    }
  });

  it("downgrades forced tool choice on Anthropic families that reject it", () => {
    const tools = [{ type: "function", function: { name: "write_tasks" } }];
    const forced = { type: "function", function: { name: "write_tasks" } };
    // Claude Opus 5.5 / Sonnet 5.5 / Fable 5.1 / Mythos 5.1 return a 400 for
    // forced tool choice on every request; the documented path is `auto`.
    for (const model of [
      "claude-opus-5-5",
      "claude-sonnet-5-5",
      "claude-fable-5-1",
      "claude-mythos-5-1",
    ]) {
      expect(
        translateAiChatRequest(
          { ...base, model, tools, toolChoice: forced },
          "anthropic",
        ).tool_choice,
      ).toBe("auto");
      expect(
        translateAiChatRequest(
          { ...base, model, tools, toolChoice: "required" },
          "anthropic",
        ).tool_choice,
      ).toBe("auto");
    }
    // Families that still accept forced tool use keep it untouched.
    expect(
      translateAiChatRequest(
        { ...base, model: "claude-fable-5", tools, toolChoice: forced },
        "anthropic",
      ).tool_choice,
    ).toEqual(forced);
    // "none" is never forced and must survive untouched.
    expect(
      translateAiChatRequest(
        { ...base, model: "claude-opus-5-5", tools, toolChoice: "none" },
        "anthropic",
      ).tool_choice,
    ).toBe("none");
  });

  it("translates Gemini to reasoning_effort and its supported stream usage", () => {
    const body = translateAiChatRequest({ ...base, stream: true }, "google");
    expect(body).toMatchObject({
      max_completion_tokens: 1234,
      reasoning_effort: "high",
      stream_options: { include_usage: true },
    });
    expect(body).not.toHaveProperty("usage");
  });

  it("stays conservative for a generic endpoint", () => {
    const body = translateAiChatRequest({ ...base, stream: true }, "generic");
    expect(body).toMatchObject({ max_tokens: 1234, stream: true });
    expect(body).not.toHaveProperty("max_completion_tokens");
    expect(body).not.toHaveProperty("reasoning");
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(body).not.toHaveProperty("stream_options");
    expect(body).not.toHaveProperty("usage");
  });

  it("expresses a fixed budget only where one exists", () => {
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
      // The manual budget must remain strictly under the output ceiling.
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
  it("fixes only the explicit tools + reasoning rejection from Chat Completions", () => {
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
      "HTTP-Referer": SITE_URL,
      "X-Title": "Minddy",
    });
  });
});
