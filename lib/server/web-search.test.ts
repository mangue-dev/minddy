import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  runtime: vi.fn(),
  platformKey: vi.fn(),
  providerFetch: vi.fn(),
  record: vi.fn(),
}));

vi.mock("@/lib/server/ai-runtime", () => ({
  resolveAiRuntime: h.runtime,
  resolvePlatformApiKey: h.platformKey,
  handleManagedKeyRejection: vi.fn(),
}));
vi.mock("@/lib/server/ai-provider-request", () => ({ fetchAiProvider: h.providerFetch }));
vi.mock("@/lib/server/app-config", () => ({ getAppConfigValues: vi.fn(async () => ({})) }));
vi.mock("@/lib/server/ai-consent", () => ({ assertAiConsent: vi.fn(async () => {}) }));
vi.mock("@/lib/server/ai-provider-errors", () => ({
  providerErrorFromResponse: vi.fn(async () => ({})),
  reportProviderError: vi.fn(),
}));
vi.mock("@/lib/server/ai-usage", () => ({
  recordAiUsage: h.record,
  parseOpenRouterUsage: () => ({
    promptTokens: 10, completionTokens: 5, totalTokens: 15, cost: 0.005, cachedTokens: null, cacheWriteTokens: null,
  }),
}));

import { parseAnthropicWebSearch, runWebSearchTool } from "./web-search";

const openRouterFetch = vi.fn();

function byok(provider: string, model: string, baseUrl: string) {
  return { apiKey: "user-key", mode: "byok", provider, baseUrl, model, requestProfile: {} };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function search() {
  return runWebSearchTool({
    query: "latest Node.js LTS",
    userId: "user-1",
    runId: "run-1",
    seq: 1_500_000_000,
    billTo: { userId: "user-1" },
    routineId: "routine-1",
  });
}

function sentBody(): Record<string, unknown> {
  const init = h.providerFetch.mock.calls[0]![2] as { body: string };
  return JSON.parse(init.body) as Record<string, unknown>;
}

beforeEach(() => {
  h.runtime.mockReset();
  h.platformKey.mockReset().mockResolvedValue({ apiKey: "cloud-key", managedKeyOwner: "user-1" });
  h.providerFetch.mockReset();
  h.record.mockReset();
  openRouterFetch.mockReset().mockResolvedValue(json({
    id: "gen-1",
    model: "cloud/search-model",
    choices: [{ message: { content: "Cloud answer", annotations: [] } }],
  }));
  vi.stubGlobal("fetch", openRouterFetch);
});

describe("web search on a personal key (MIN-1021)", () => {
  it("searches with Anthropic's own tool, on the account's model and key", async () => {
    h.runtime.mockResolvedValue(byok("anthropic", "claude-sonnet-5-5", "https://api.anthropic.com/v1"));
    h.providerFetch.mockResolvedValue(json({
      id: "msg-1",
      model: "claude-sonnet-5-5",
      content: [
        { type: "server_tool_use", id: "srv-1", name: "web_search", input: { query: "latest Node.js LTS" } },
        {
          type: "web_search_tool_result",
          tool_use_id: "srv-1",
          content: [
            { type: "web_search_result", url: "https://nodejs.org/en/about/releases", title: "Releases", encrypted_content: "x" },
            { type: "web_search_result", url: "https://example.com/node", title: "Node news", encrypted_content: "y" },
          ],
        },
        {
          type: "text",
          text: "Node.js 24 is the active LTS.",
          citations: [{
            type: "web_search_result_location",
            url: "https://nodejs.org/en/about/releases",
            title: "Releases",
            cited_text: "Node.js 24 is Active LTS",
          }],
        },
      ],
      usage: { input_tokens: 900, output_tokens: 40 },
    }));

    const outcome = await search();

    expect(h.providerFetch).toHaveBeenCalledWith("anthropic", "https://api.anthropic.com/v1/messages", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "x-api-key": "user-key" }),
    }));
    const body = sentBody();
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.tools).toEqual([{ type: "web_search_20250305", name: "web_search", max_uses: 1 }]);
    // Sonnet 5.5 must think: the cheapest effort, never adaptive thinking.
    expect(body.thinking).toBeUndefined();
    expect(body.output_config).toEqual({ effort: "low" });
    expect(openRouterFetch).not.toHaveBeenCalled();
    expect(h.platformKey).not.toHaveBeenCalled();
    expect(h.record).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      success: true,
      result: {
        query: "latest Node.js LTS",
        answer: "Node.js 24 is the active LTS.",
        sources: [
          { url: "https://nodejs.org/en/about/releases", title: "Releases", snippet: "Node.js 24 is Active LTS" },
          { url: "https://example.com/node", title: "Node news", snippet: null },
        ],
      },
    });
  });

  it("searches with OpenAI's Responses tool, on the account's model and key", async () => {
    h.runtime.mockResolvedValue(byok("openai", "gpt-5.5", "https://api.openai.com/v1"));
    h.providerFetch.mockResolvedValue(json({
      id: "resp-1",
      model: "gpt-5.5",
      output: [
        { type: "web_search_call", status: "completed", action: { sources: [{ url: "https://read.example/a" }] } },
        {
          type: "message",
          content: [{
            type: "output_text",
            text: "Node.js 24.",
            annotations: [{ type: "url_citation", url: "https://nodejs.org/", title: "Node.js", start_index: 0, end_index: 10 }],
          }],
        },
      ],
      usage: { input_tokens: 800, output_tokens: 30 },
    }));

    const outcome = await search();

    expect(h.providerFetch).toHaveBeenCalledWith("openai", "https://api.openai.com/v1/responses", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer user-key" }),
    }));
    const body = sentBody();
    expect(body.model).toBe("gpt-5.5");
    expect(body.tools).toEqual([{ type: "web_search" }]);
    // OpenAI refuses `minimal` next to its web search tool.
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.include).toEqual(["reasoning.encrypted_content"]);
    expect(openRouterFetch).not.toHaveBeenCalled();
    expect(outcome.result).toMatchObject({
      answer: "Node.js 24.",
      sources: [
        { url: "https://nodejs.org/", title: "Node.js", snippet: null },
        { url: "https://read.example/a", title: null, snippet: null },
      ],
    });
  });

  it("asks no encrypted reasoning from an OpenAI model that does not reason", async () => {
    h.runtime.mockResolvedValue(byok("openai", "gpt-4.1", "https://api.openai.com/v1"));
    h.providerFetch.mockResolvedValue(json({ output: [] }));

    await search();

    const body = sentBody();
    expect(body.reasoning).toBeUndefined();
    expect(body.include).toBeUndefined();
  });

  it("returns a failed native search instead of replaying it on minddy Cloud", async () => {
    h.runtime.mockResolvedValue(byok("anthropic", "claude-sonnet-5-5", "https://api.anthropic.com/v1"));
    h.providerFetch.mockResolvedValue(json({ type: "error", error: { message: "web search is disabled" } }, 400));

    const outcome = await search();

    expect(outcome.success).toBe(false);
    expect(outcome.result).toMatchObject({ error: expect.stringContaining("web search failed (400)") });
    expect(openRouterFetch).not.toHaveBeenCalled();
    expect(h.platformKey).not.toHaveBeenCalled();
  });

  it("keeps minddy Cloud for a personal provider without a search of its own", async () => {
    h.runtime.mockResolvedValue(byok("deepseek", "deepseek-chat", "https://api.deepseek.com/v1"));

    const outcome = await search();

    expect(h.providerFetch).not.toHaveBeenCalled();
    expect(h.platformKey).toHaveBeenCalledWith("user-1");
    expect(openRouterFetch).toHaveBeenCalledOnce();
    expect(outcome).toMatchObject({ success: true, result: { answer: "Cloud answer" } });
    expect(h.record).toHaveBeenCalledWith(expect.objectContaining({ keyMode: "platform", routineId: "routine-1" }));
  });

  it("runs the OpenRouter plugin on an OpenRouter key with the account's model", async () => {
    h.runtime.mockResolvedValue(byok("openrouter", "anthropic/claude-sonnet-5.5", "https://openrouter.ai/api/v1"));

    await search();

    expect(h.platformKey).not.toHaveBeenCalled();
    const [, init] = openRouterFetch.mock.calls[0]! as [string, { headers: Record<string, string>; body: string }];
    expect(init.headers.Authorization).toBe("Bearer user-key");
    expect(JSON.parse(init.body).model).toBe("anthropic/claude-sonnet-5.5");
  });
});

describe("parseAnthropicWebSearch", () => {
  it("reports a search error when the model wrote no answer", () => {
    expect(parseAnthropicWebSearch({
      content: [{ type: "web_search_tool_result", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } }],
    }, 5)).toEqual({ answer: "", sources: [], error: "web search failed: max_uses_exceeded" });
  });

  it("keeps each source once and stops at the requested count", () => {
    const parsed = parseAnthropicWebSearch({
      content: [
        { type: "text", text: "A", citations: [{ url: "https://a.example", title: "A", cited_text: "a" }] },
        { type: "text", text: "B", citations: [{ url: "https://a.example", title: "A", cited_text: "again" }] },
        {
          type: "web_search_tool_result",
          content: [{ url: "https://b.example", title: "B" }, { url: "https://c.example", title: "C" }],
        },
      ],
    }, 2);
    expect(parsed.answer).toBe("AB");
    expect(parsed.sources.map((source) => source.url)).toEqual(["https://a.example", "https://b.example"]);
  });
});
