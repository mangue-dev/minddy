import { describe, expect, it } from "vitest";

import {
  alternateOutputTokenBody,
  anthropicModelReasoning,
  catalogModelReasoning,
  nativeModelReasoning,
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
  it("translates OpenAI without retaining the legacy max_tokens field", () => {
    const body = translateAiChatRequest({ ...base, model: "gpt-5.7", stream: true }, "openai");
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

  it("sends Claude's adaptive thinking and effort natively (MIN-826)", () => {
    // Native Messages API fields, carried as they are by the Anthropic
    // transport; the effort really changes the depth there.
    expect(
      translateAiChatRequest({ ...base, model: "claude-opus-5-5", reasoning: { effort: "max" } }, "anthropic"),
    ).toMatchObject({
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: "max" },
      // Thinking shares the ceiling: lifted so it cannot consume the answer.
      max_tokens: 16_000,
    });
    for (const [model, effort, sent] of [
      ["claude-opus-4-7", "minimal", "low"],
      ["claude-sonnet-5", "xhigh", "xhigh"],
      ["claude-haiku-5-5", "medium", "medium"],
      // Claude 4.6 predates `xhigh`: the level folds down, never up.
      ["claude-opus-4-6", "xhigh", "high"],
    ] as const) {
      expect(translateAiChatRequest({ ...base, model, reasoning: { effort } }, "anthropic"))
        .toMatchObject({ thinking: { type: "adaptive" }, output_config: { effort: sent } });
    }
    // No requested reasoning: the model keeps its own default.
    const plain = translateAiChatRequest({ model: "claude-sonnet-5", messages: [], maxOutputTokens: 1234 }, "anthropic");
    expect(plain).toMatchObject({ max_tokens: 1234 });
    expect(plain).not.toHaveProperty("thinking");
    expect(plain).not.toHaveProperty("output_config");
    expect(plain).not.toHaveProperty("max_completion_tokens");
  });

  it("keeps a manual budget on the Claude 4.5 families", () => {
    // Haiku 4.5 rejects adaptive thinking and Sonnet 4.5 rejects `effort`.
    expect(
      translateAiChatRequest({ ...base, model: "claude-haiku-4-5", reasoning: { effort: "low" } }, "anthropic"),
    ).toMatchObject({ thinking: { type: "enabled", budget_tokens: 1024 } });
    expect(
      translateAiChatRequest({ ...base, model: "claude-sonnet-4-5", reasoning: { effort: "medium" } }, "anthropic"),
    ).not.toHaveProperty("output_config");
    expect(
      translateAiChatRequest({ ...base, model: "claude-unknown", reasoning: { effort: "high" } }, "anthropic"),
    ).not.toHaveProperty("thinking");
  });

  it("turns Claude reasoning off where the family allows it", () => {
    for (const model of ["claude-sonnet-5", "claude-opus-5", "claude-opus-4-7", "claude-haiku-4-5"]) {
      expect(translateAiChatRequest({ ...base, model, reasoning: { effort: "off" } }, "anthropic"))
        .toMatchObject({ thinking: { type: "disabled" } });
    }
    // Families that reject `disabled` (400) run at their cheapest effort.
    for (const model of ["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5", "claude-mythos-preview"]) {
      const body = translateAiChatRequest({ ...base, model, reasoning: { effort: "off" } }, "anthropic");
      expect(body).not.toHaveProperty("thinking");
      expect(body).toMatchObject({ output_config: { effort: "low" } });
    }
  });

  it("drops a manual budget when the tool choice is forced", () => {
    // "Thinking may not be enabled when tool_choice forces tool use" (400).
    const tools = [{ type: "function", function: { name: "fill" } }];
    const body = translateAiChatRequest({
      ...base, model: "claude-opus-4-6", tools, reasoning: { maxTokens: 2048 },
      toolChoice: { type: "function", function: { name: "fill" } },
    }, "anthropic");
    expect(body).not.toHaveProperty("thinking");
    expect(body.tool_choice).toEqual({ type: "function", function: { name: "fill" } });
  });

  it("publishes each Claude family's real levels to the picker", () => {
    expect(anthropicModelReasoning("claude-opus-5-5"))
      .toEqual({ efforts: ["low", "medium", "high", "xhigh", "max"], mandatory: true });
    expect(anthropicModelReasoning("claude-sonnet-5"))
      .toEqual({ efforts: ["low", "medium", "high", "xhigh", "max"], mandatory: false });
    expect(anthropicModelReasoning("claude-opus-4-6"))
      .toEqual({ efforts: ["low", "medium", "high", "max"], mandatory: false });
    // Manual-budget and unknown families keep the generic levels.
    expect(anthropicModelReasoning("claude-haiku-4-5-20251001")).toBeUndefined();
    expect(anthropicModelReasoning("claude-unknown")).toBeUndefined();
  });

  it("sends OpenAI reasoning only to reasoning models, at levels they take", () => {
    // `reasoning_effort` on a chat model (gpt-4o, gpt-4.1) is a 400.
    for (const model of ["gpt-4o", "gpt-4.1-mini", "chatgpt-4o-latest"]) {
      expect(translateAiChatRequest({ ...base, model }, "openai")).not.toHaveProperty("reasoning_effort");
    }
    // GPT-5.1+ really turns reasoning off with "none"; GPT-5 and o-series cannot.
    expect(translateAiChatRequest({ ...base, model: "gpt-5.1", reasoning: { effort: "off" } }, "openai"))
      .toMatchObject({ reasoning_effort: "none" });
    for (const model of ["gpt-5", "o3"]) {
      expect(translateAiChatRequest({ ...base, model, reasoning: { effort: "off" } }, "openai"))
        .not.toHaveProperty("reasoning_effort");
    }
    expect(translateAiChatRequest({ ...base, model: "gpt-5-mini", reasoning: { effort: "minimal" } }, "openai"))
      .toMatchObject({ reasoning_effort: "minimal" });
    expect(translateAiChatRequest({ ...base, model: "gpt-5.2", reasoning: { effort: "max" } }, "openai"))
      .toMatchObject({ reasoning_effort: "high" });
  });

  it("follows Gemini's per-model thinking rules", () => {
    expect(translateAiChatRequest({ ...base, model: "gemini-2.5-flash", reasoning: { effort: "off" } }, "google"))
      .toMatchObject({ reasoning_effort: "none" });
    // 2.5 Pro and Gemini 3 cannot stop thinking; 3 Pro only takes low / high.
    for (const model of ["gemini-2.5-pro", "gemini-3-pro-preview"]) {
      expect(translateAiChatRequest({ ...base, model, reasoning: { effort: "off" } }, "google"))
        .not.toHaveProperty("reasoning_effort");
    }
    expect(translateAiChatRequest({ ...base, model: "gemini-3-pro-preview", reasoning: { effort: "medium" } }, "google"))
      .toMatchObject({ reasoning_effort: "low" });
    expect(translateAiChatRequest({ ...base, model: "gemini-2.0-flash" }, "google"))
      .not.toHaveProperty("reasoning_effort");
  });

  it("describes which direct providers honor reasoning levels", () => {
    expect(nativeModelReasoning("openai", "gpt-4o")).toBeNull();
    expect(nativeModelReasoning("openai", "gpt-5.1")).toEqual({ efforts: ["low", "medium", "high"], mandatory: false });
    expect(nativeModelReasoning("google", "gemini-2.5-pro")).toMatchObject({ mandatory: true });
    // Endpoints without a reasoning field: no level would reach the model.
    for (const provider of ["generic", "local_openai", "ollama", "opencode-go", "opencode-zen"] as const) {
      expect(nativeModelReasoning(provider, "any-model")).toBeNull();
    }
    // OpenRouter publishes its own levels per model.
    expect(nativeModelReasoning("openrouter", "openai/gpt-5.1")).toBeUndefined();
    // A catalog entry wins; a model without one falls back to the rule.
    expect(catalogModelReasoning("openai", "gpt-4o", { reasoning: { efforts: ["low"], mandatory: false } }))
      .toEqual({ efforts: ["low"], mandatory: false });
    expect(catalogModelReasoning("ollama", "llama3", undefined)).toBeNull();
    expect(catalogModelReasoning("openrouter", null, undefined)).toBeUndefined();
  });

  it("keeps Gemini's tool-call extras for Gemini only", () => {
    const messages = [{
      role: "assistant",
      content: null,
      tool_calls: [{
        id: "call_1", type: "function", function: { name: "list", arguments: "{}" },
        extra_content: { google: { thought_signature: "sig" } },
      }],
    }];
    const sent = (provider: "google" | "openai" | "anthropic") =>
      (translateAiChatRequest({ model: "m", messages }, provider).messages as Array<{ tool_calls: unknown[] }>)[0]!.tool_calls[0];
    expect(sent("google")).toHaveProperty("extra_content");
    expect(sent("openai")).not.toHaveProperty("extra_content");
    expect(sent("anthropic")).not.toHaveProperty("extra_content");
  });

  it("drops the sampling temperature that Claude 4.7 and later reject", () => {
    const request = { ...base, temperature: 0 };
    for (const model of ["claude-opus-5-5", "claude-sonnet-5", "claude-opus-4-7"]) {
      expect(translateAiChatRequest({ ...request, model }, "anthropic"))
        .not.toHaveProperty("temperature");
    }
    expect(translateAiChatRequest({ ...request, model: "claude-sonnet-4-6" }, "anthropic"))
      .toMatchObject({ temperature: 0 });
    expect(translateAiChatRequest({ ...request, model: "claude-opus-5-5" }, "openrouter"))
      .toMatchObject({ temperature: 0 });
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
    const body = translateAiChatRequest({ ...base, model: "gemini-2.5-flash", stream: true }, "google");
    expect(body).toMatchObject({
      max_completion_tokens: 1234,
      reasoning_effort: "high",
      stream_options: { include_usage: true },
    });
    expect(body).not.toHaveProperty("usage");
  });

  it("preserves non-forced choices and other providers' tool restrictions", () => {
    const tools = [{ type: "function", function: { name: "write_tasks" } }];
    const request = { ...base, model: "claude-opus-5-5", tools };
    for (const toolChoice of [
      "auto",
      "none",
      { type: "allowed_tools", allowed_tools: { mode: "auto", tools } },
    ]) {
      expect(translateAiChatRequest({ ...request, toolChoice }, "anthropic").tool_choice)
        .toEqual(toolChoice);
    }
    const required = { type: "allowed_tools", allowed_tools: { mode: "required", tools } };
    expect(translateAiChatRequest({ ...request, toolChoice: required }, "anthropic").tool_choice)
      .toBe("auto");
    for (const provider of ["openai", "openrouter", "generic"] as const) {
      expect(translateAiChatRequest({ ...request, toolChoice: required }, provider).tool_choice)
        .toEqual(required);
    }
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

  it("really disables optional OpenRouter reasoning at off", () => {
    expect(translateAiChatRequest({ ...base, reasoning: { enabled: false, effort: "low" } }, "openrouter"))
      .toMatchObject({ reasoning: { enabled: false } });
    // Omitting the field ran the model at its default effort (MIN-826).
    expect(translateAiChatRequest({ ...base, reasoning: { effort: "off" } }, "openrouter"))
      .toMatchObject({ reasoning: { enabled: false } });
    for (const provider of ["generic", "openai", "google", "anthropic"] as const) {
      expect(translateAiChatRequest({ ...base, reasoning: { enabled: false } }, provider))
        .not.toHaveProperty("reasoning");
    }
  });
});

describe("translateLegacyAiChatBody", () => {
  it("normalizes opencode aliases before translating them", () => {
    const body = translateLegacyAiChatBody(
      {
        model: "gpt-5.7",
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

  it("avoids rejected forced tool choices in Anthropic code-worker requests", () => {
    const tools = [{ type: "function", function: { name: "write_tasks" } }];
    for (const model of [
      "claude-opus-5-5",
      "claude-sonnet-5-5",
      "claude-fable-5-1",
      "claude-mythos-5-1",
    ]) {
      for (const tool_choice of ["required", tools[0]]) {
        const body = translateLegacyAiChatBody(
          { model, messages: [], tools, tool_choice }, "anthropic", "off",
        );
        expect(body.tool_choice).toBe("auto");
        expect(body).not.toHaveProperty("thinking");
        expect(body.tools).toEqual(tools);
      }
    }
    expect(translateLegacyAiChatBody(
      { model: "claude-fable-5", messages: [], tools, tool_choice: "required" },
      "anthropic", "off",
    ).tool_choice).toBe("required");
    expect(translateLegacyAiChatBody(
      { model: "claude-opus-5-5", messages: [], tools, tool_choice: "none" },
      "anthropic",
    ).tool_choice).toBe("none");
  });
});

describe("alternateOutputTokenBody", () => {
  it("changes only the explicitly rejected alias", () => {
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

describe("repairRejectedAiChatBody — mandatory reasoning", () => {
  it("replays a refused disable at the model's own default", () => {
    const openRouter = JSON.stringify({ model: "m", reasoning: { enabled: false } });
    expect(JSON.parse(repairRejectedAiChatBody(openRouter, "Reasoning is mandatory for this endpoint and cannot be disabled.")!))
      .toEqual({ model: "m" });
    const gemini = JSON.stringify({ model: "gemini-3-pro", reasoning_effort: "none" });
    expect(JSON.parse(repairRejectedAiChatBody(gemini, "Reasoning cannot be turned off for this model")!))
      .toEqual({ model: "gemini-3-pro" });
    // An active effort is never stripped by this rule.
    expect(repairRejectedAiChatBody(JSON.stringify({ model: "m", reasoning: { effort: "low" } }),
      "Reasoning is mandatory")).toBeNull();
  });
});

describe("aiChatProviderHeaders", () => {
  it("adds only the headers documented by the provider profile", () => {
    expect(aiChatProviderHeaders("openai", "x")).toEqual({});
    expect(aiChatProviderHeaders("anthropic", "x")).toEqual({});
    expect(aiChatProviderHeaders("openrouter", "Minddy")).toMatchObject({
      "HTTP-Referer": SITE_URL,
      "X-Title": "Minddy",
    });
  });
});
