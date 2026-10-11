import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/assistant/model-preferences", () => ({ getNumoPreferences: vi.fn(async () => ({ provider: "openrouter", default_model: null, application_model: "account-default" })) }));

const h = vi.hoisted(() => ({
  runtime: vi.fn(),
  catalog: vi.fn(),
  conversationModels: vi.fn(),
  plan: vi.fn(),
  defaultReasoning: vi.fn(),
}));

vi.mock("@/lib/server/ai-runtime", () => ({
  resolveAiRuntime: h.runtime,
  ManagedAiUnavailableError: class extends Error {},
}));
vi.mock("@/lib/server/agent/models-catalog", () => ({
  getAssistantModelsForUser: h.catalog,
  getOpenRouterConversationModels: h.conversationModels,
}));
vi.mock("@/lib/server/agent/model-plan", () => ({ ensureModelInPlan: h.plan }));
vi.mock("@/lib/server/assistant/reasoning", () => ({
  getAssistantReasoningLevel: h.defaultReasoning,
}));

const { getNumoPreferences } = await import("./model-preferences");
const { resolveNumoTurnConfiguration } = await import("./conversation-config");

const runtime = {
  apiKey: "key",
  mode: "platform" as const,
  provider: "openrouter" as const,
  baseUrl: "https://openrouter.ai/api/v1",
  model: "account-default",
  requestProfile: { outputTokenField: "max_tokens" as const },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getNumoPreferences).mockResolvedValue({ provider: "openrouter", default_model: null, application_model: "account-default" });
  h.runtime.mockImplementation(async (input: { modelOverride?: string | null }) => ({
    ...runtime,
    model: input.modelOverride || runtime.model,
  }));
  h.catalog.mockResolvedValue({
    provider: "openrouter",
    defaultModel: runtime.model,
    models: [
      { id: "chosen-model", name: "Chosen", reasoning: { efforts: ["low", "high"], mandatory: true } },
      { id: runtime.model, name: "Default", reasoning: { efforts: ["low", "medium"], mandatory: false } },
    ],
    maxMultiplier: 4,
    planId: "go",
    recommended: [],
  });
  h.defaultReasoning.mockResolvedValue("medium");
  h.conversationModels.mockImplementation(async () => (await h.catalog()).models);
});

it("preserves the documentation managed-provider requirement", async () => {
  await resolveNumoTurnConfiguration({ userId: "user", managedOnly: true });
  expect(h.runtime).toHaveBeenCalledWith(expect.objectContaining({ userId: "user", managedOnly: true }));
});

describe("Numo conversation configuration", () => {
  it("does not wait for picker-only account and recommendation work on OpenRouter admission", async () => {
    h.catalog.mockImplementation(() => new Promise(() => {}));
    h.conversationModels.mockResolvedValue([
      { id: "chosen-model", reasoning: { efforts: ["low", "high"], mandatory: true } },
    ]);
    await expect(resolveNumoTurnConfiguration({
      userId: "user", model: "chosen-model", reasoningLevel: "low",
    })).resolves.toMatchObject({ model: "chosen-model", reasoningLevel: "low" });
    expect(h.catalog).not.toHaveBeenCalled();
    expect(h.plan).toHaveBeenCalledTimes(1);
  });
  it("keeps an explicit model and validates it against the active provider", async () => {
    const resolved = await resolveNumoTurnConfiguration({
      userId: "user",
      model: "chosen-model",
      reasoningLevel: "high",
    });

    expect(resolved.model).toBe("chosen-model");
    expect(resolved.reasoningLevel).toBe("high");
    expect(resolved.runtime.model).toBe("chosen-model");
    expect(h.plan).toHaveBeenCalledWith({ userId: "user", model: "chosen-model", mode: "platform" });
  });

  it("rejects an unavailable model instead of falling back to the default", async () => {
    await expect(resolveNumoTurnConfiguration({ userId: "user", model: "missing-model" }))
      .rejects.toMatchObject({ code: "model_unavailable", status: 422 });
  });

  it("lets every Numo model disable explicit reasoning", async () => {
    await expect(resolveNumoTurnConfiguration({
      userId: "user",
      model: "chosen-model",
      reasoningLevel: "off",
    })).resolves.toMatchObject({
      model: "chosen-model",
      reasoningLevel: "off",
    });
  });

  it("does not apply Minddy's plan ceiling to a BYOK model", async () => {
    h.runtime.mockResolvedValue({ ...runtime, mode: "byok", model: "chosen-model" });

    await expect(resolveNumoTurnConfiguration({
      userId: "user",
      model: "chosen-model",
      reasoningLevel: "high",
    })).resolves.toMatchObject({ model: "chosen-model" });
    expect(h.plan).not.toHaveBeenCalled();
  });

  it("inherits the personal default without freezing it onto the conversation", async () => {
    vi.mocked(getNumoPreferences).mockResolvedValue({ provider: "openrouter", default_model: "chosen-model", application_model: "account-default" });
    const result = await resolveNumoTurnConfiguration({ userId: "user" });
    expect(result).toMatchObject({ model: "chosen-model", persistedModel: null });
    expect(getNumoPreferences).toHaveBeenCalledWith("user");
    expect(h.plan).toHaveBeenCalledWith({ userId: "user", model: "chosen-model", mode: "platform" });
  });
  it("lets an explicit conversation model override the personal default", async () => {
    await resolveNumoTurnConfiguration({ userId: "user", model: "chosen-model" });
    expect(getNumoPreferences).not.toHaveBeenCalled();
  });
  it("does not apply personal workspace defaults to documentation help", async () => {
    await resolveNumoTurnConfiguration({ userId: "user", managedOnly: true });
    expect(getNumoPreferences).not.toHaveBeenCalled();
    expect(h.runtime).toHaveBeenCalledWith(expect.objectContaining({ managedOnly: true, applicationModelDefault: true }));
  });
  it("refuses provider changes during preference resolution", async () => {
    vi.mocked(getNumoPreferences).mockResolvedValue({ provider: "anthropic", default_model: "chosen-model", application_model: "account-default" });
    await expect(resolveNumoTurnConfiguration({ userId: "user" })).rejects.toMatchObject({ code: "model_unavailable" });
  });
  it("refuses a removed personal model instead of silently replacing it", async () => {
    vi.mocked(getNumoPreferences).mockResolvedValue({ provider: "openrouter", default_model: "removed-model", application_model: "account-default" });
    await expect(resolveNumoTurnConfiguration({ userId: "user" })).rejects.toMatchObject({ code: "model_unavailable" });
  });
  it("keeps legacy conversations on the account default when no override is stored", async () => {
    h.conversationModels.mockResolvedValue([
      { id: runtime.model, reasoning: { efforts: ["low", "medium"], mandatory: false } },
    ]);
    const resolved = await resolveNumoTurnConfiguration({ userId: "user" });

    expect(resolved).toMatchObject({
      model: "account-default",
      reasoningLevel: "medium",
      persistedModel: null,
      persistedReasoningLevel: null,
    });
    expect(h.catalog).not.toHaveBeenCalled();
  });

  it("uses the displayed GLM reasoning level when the browser inherits both defaults", async () => {
    h.runtime.mockResolvedValue({ ...runtime, model: "z-ai/glm-5.3-flash" });
    h.catalog.mockImplementation(() => new Promise(() => {}));
    h.conversationModels.mockResolvedValue([
      { id: "z-ai/glm-5.3-flash", reasoning: { efforts: ["max", "high", "low"], mandatory: true } },
    ]);

    await expect(resolveNumoTurnConfiguration({
      userId: "user", model: null, reasoningLevel: null,
    })).resolves.toMatchObject({
      model: "z-ai/glm-5.3-flash",
      reasoningLevel: "low",
      persistedModel: null,
      persistedReasoningLevel: null,
    });
    expect(h.conversationModels).toHaveBeenCalledWith(runtime.apiKey);
    expect(h.catalog).not.toHaveBeenCalled();
    expect(h.plan).not.toHaveBeenCalled();
  });
});
