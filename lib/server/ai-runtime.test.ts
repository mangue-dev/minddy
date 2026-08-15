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

const { resolveAiRuntime } = await import("@/lib/server/ai-runtime");

describe("resolveAiRuntime", () => {
  beforeEach(() => {
    config.clear();
    getUserByok.mockReset();
    process.env.OPENROUTER_API_KEY = "platform-key";
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
