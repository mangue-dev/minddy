import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const config = new Map<string, string>();
const getUserByok = vi.fn();

vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValues: vi.fn(async (keys: string[]) =>
    Object.fromEntries(keys.map((key) => [key, config.get(key) ?? null])),
  ),
}));

vi.mock("@/lib/server/agent/model", () => ({
  getUserByok,
  resolveProviderDefaultModel: vi.fn(async () => null),
}));

const { fetchAiChat, resolveAiRuntime } = await import("@/lib/server/ai-runtime");

describe("resolveAiRuntime", () => {
  beforeEach(() => {
    config.clear();
    getUserByok.mockReset();
    process.env.OPENROUTER_API_KEY = "platform-key";
    process.env.MINDDY_MANAGED_AI = "1";
    config.set("assistant_model", "platform/chat");
  });

  it("retombe intégralement sur Minddy quand la surface est décochée", async () => {
    getUserByok.mockResolvedValue(null);
    await expect(
      resolveAiRuntime({ userId: "u1", modelKey: "assistant_model" }),
    ).resolves.toMatchObject({
      mode: "platform",
      provider: "openrouter",
      apiKey: "platform-key",
      model: "platform/chat",
    });
    expect(getUserByok).toHaveBeenCalledWith("u1", "assistant");
  });

  it("ne prend jamais la clé plateforme sans opt-in de service managé", async () => {
    process.env.MINDDY_MANAGED_AI = "";
    getUserByok.mockResolvedValue(null);

    await expect(
      resolveAiRuntime({ userId: "u1", modelKey: "assistant_model" }),
    ).rejects.toMatchObject({ name: "ManagedAiUnavailableError" });
  });

  it("fait hériter OpenRouter BYOK du modèle plateforme du même appel", async () => {
    getUserByok.mockResolvedValue({
      provider: "openrouter",
      apiKey: "user-key",
      baseUrl: "https://openrouter.ai/api/v1",
      featureModels: {},
    });
    await expect(
      resolveAiRuntime({ userId: "u1", modelKey: "assistant_model" }),
    ).resolves.toMatchObject({ mode: "byok", apiKey: "user-key", model: "platform/chat" });
  });

  it("préfère le modèle explicite du compte sur un provider natif", async () => {
    getUserByok.mockResolvedValue({
      provider: "anthropic",
      apiKey: "anthropic-key",
      baseUrl: "https://api.anthropic.com/v1",
      featureModels: { assistant_model: "claude-custom" },
    });
    await expect(
      resolveAiRuntime({ userId: "u1", modelKey: "assistant_model" }),
    ).resolves.toMatchObject({
      mode: "byok",
      provider: "anthropic",
      model: "claude-custom",
    });
  });

  it("utilise le défaut provider × feature configuré par l'admin", async () => {
    config.set("byok_default_openai_transcription_model", "whisper-admin");
    getUserByok.mockResolvedValue({
      provider: "openai",
      apiKey: "openai-key",
      baseUrl: "https://api.openai.com/v1",
      featureModels: {},
    });
    await expect(
      resolveAiRuntime({ userId: "u1", modelKey: "transcription_model" }),
    ).resolves.toMatchObject({ mode: "byok", model: "whisper-admin" });
  });

  it("fait hériter une automatisation OpenRouter du modèle d'automatisation plateforme", async () => {
    config.set("automation_agent_model", "platform/automation");
    getUserByok.mockResolvedValue({
      provider: "openrouter",
      apiKey: "user-key",
      baseUrl: "https://openrouter.ai/api/v1",
      featureModels: {},
    });
    await expect(
      resolveAiRuntime({ userId: "u1", modelKey: "automation_agent_model" }),
    ).resolves.toMatchObject({ mode: "byok", model: "platform/automation" });
    expect(getUserByok).toHaveBeenCalledWith("u1", "automations");
  });
});

describe("fetchAiChat", () => {
  const runtime = {
    apiKey: "user-key",
    mode: "byok" as const,
    provider: "google" as const,
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-test",
    requestProfile: {
      streamUsage: true,
      outputTokenField: "max_completion_tokens" as const,
      reasoningField: "reasoning_effort" as const,
    },
  };

  it("retente l'autre alias de plafond après un rejet explicite", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: "Unsupported parameter: max_completion_tokens" } }),
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const { response } = await fetchAiChat(
      runtime,
      runtime.model,
      (model) => ({ model, messages: [], maxOutputTokens: 321 }),
      "test",
      "[test]",
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      max_completion_tokens: 321,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      max_tokens: 321,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).not.toHaveProperty(
      "max_completion_tokens",
    );
    fetchMock.mockRestore();
  });

  it("ne retente pas un 400 sans rapport avec le plafond", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("invalid tool schema", { status: 400 }));

    const { response } = await fetchAiChat(
      runtime,
      runtime.model,
      (model) => ({ model, messages: [], maxOutputTokens: 321 }),
      "test",
      "[test]",
    );

    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });

  it("retente avec reasoning none après le rejet explicite des function tools", async () => {
    const openAiRuntime = {
      ...runtime,
      provider: "openai" as const,
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-future",
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message:
                "Function tools with reasoning_effort are not supported for gpt-future",
            },
          }),
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const { response } = await fetchAiChat(
      openAiRuntime,
      openAiRuntime.model,
      (model) => ({
        model,
        messages: [],
        tools: [{ type: "function", function: { name: "search" } }],
        reasoning: { effort: "medium" },
      }),
      "test",
      "[test]",
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      reasoning_effort: "medium",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      reasoning_effort: "none",
    });
    fetchMock.mockRestore();
  });
});
