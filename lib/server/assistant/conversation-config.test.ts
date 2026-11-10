import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  route: "minddy",
  runtime: vi.fn(),
  catalog: vi.fn(),
  conversationModels: vi.fn(),
  defaultReasoning: vi.fn(),
  defaultModel: vi.fn(async (_user: string, _provider: string): Promise<string | null> => null),
}));

vi.mock("@/lib/server/assistant/model-preferences", () => ({
  getNumoProvider: vi.fn(async () => h.route),
  getNumoDefaultModel: h.defaultModel,
  numoModelIsInstanceDefined: (provider: string | null | undefined) => provider === "minddy",
}));
vi.mock("@/lib/server/ai-runtime", () => ({
  resolveAiRuntime: h.runtime,
  ManagedAiUnavailableError: class extends Error {},
}));
vi.mock("@/lib/server/agent/models-catalog", () => ({
  getAssistantModelsForUser: h.catalog,
  getOpenRouterConversationModels: h.conversationModels,
}));
vi.mock("@/lib/server/assistant/reasoning", () => ({
  getAssistantReasoningLevel: h.defaultReasoning,
}));

const { ChosenProviderUnavailableError } = await import("@/lib/server/ai-provider-errors");
const { assertNumoChoiceAllowed, resolveNumoTurnConfiguration } = await import("./conversation-config");

const ADMIN_MODEL = "account-default";

beforeEach(() => {
  vi.clearAllMocks();
  h.route = "minddy";
  h.defaultModel.mockResolvedValue(null);
  // Minddy Cloud runs on the platform key; a personal provider on its own key.
  h.runtime.mockImplementation(async (input: { modelOverride?: string | null; provider?: string | null; managedOnly?: boolean }) => {
    const provider = input.managedOnly ? "minddy" : input.provider ?? h.route;
    return {
      apiKey: "key",
      mode: provider === "minddy" ? "platform" as const : "byok" as const,
      provider: "openrouter" as const,
      baseUrl: "https://openrouter.ai/api/v1",
      model: input.modelOverride || ADMIN_MODEL,
      requestProfile: { outputTokenField: "max_tokens" as const },
    };
  });
  h.conversationModels.mockResolvedValue([
    { id: "chosen-model", name: "Chosen", reasoning: { efforts: ["low", "high"], mandatory: true } },
    { id: ADMIN_MODEL, name: "Default", reasoning: { efforts: ["low", "medium"], mandatory: false } },
  ]);
  h.catalog.mockImplementation(async () => ({ models: await h.conversationModels() }));
  h.defaultReasoning.mockResolvedValue("medium");
});

describe("Numo on the instance's provider (MIN-954)", () => {
  it("runs the administrator's model and reasoning, ignoring a choice stored on the conversation", async () => {
    const resolved = await resolveNumoTurnConfiguration({
      userId: "user", model: "chosen-model", reasoningLevel: "high",
    });
    expect(resolved).toMatchObject({
      modelLocked: true,
      model: ADMIN_MODEL,
      reasoningLevel: "medium",
      persistedModel: null,
      persistedReasoningLevel: null,
    });
    expect(h.runtime).toHaveBeenCalledWith(expect.objectContaining({ modelOverride: null }));
    // A personal default saved for Minddy Cloud before MIN-954 is not read.
    expect(h.defaultModel).not.toHaveBeenCalled();
  });

  it("also locks a conversation pinned to minddy while the account routes Numo elsewhere", async () => {
    h.route = "anthropic";
    await expect(resolveNumoTurnConfiguration({ userId: "user", provider: "minddy", model: "chosen-model" }))
      .resolves.toMatchObject({ modelLocked: true, model: ADMIN_MODEL, persistedProvider: "minddy" });
  });

  it("refuses a new model or level, and accepts clearing them", async () => {
    const resolved = await resolveNumoTurnConfiguration({ userId: "user" });
    expect(() => assertNumoChoiceAllowed(resolved, { model: "chosen-model" }))
      .toThrow(expect.objectContaining({ code: "model_locked", status: 422 }));
    expect(() => assertNumoChoiceAllowed(resolved, { reasoningLevel: "high" }))
      .toThrow(expect.objectContaining({ code: "model_locked" }));
    expect(() => assertNumoChoiceAllowed(resolved, { model: null, reasoningLevel: null })).not.toThrow();
  });

  it("keeps the documentation help on the managed provider", async () => {
    await expect(resolveNumoTurnConfiguration({ userId: "user", managedOnly: true }))
      .resolves.toMatchObject({ modelLocked: true, model: ADMIN_MODEL });
    expect(h.runtime).toHaveBeenCalledWith(expect.objectContaining({ managedOnly: true, applicationModelDefault: true }));
  });

  it("maps the administrator's reasoning onto the levels the model offers", async () => {
    h.runtime.mockResolvedValue({
      apiKey: "key", mode: "platform", provider: "openrouter", baseUrl: "", model: "z-ai/glm-5.3-flash",
      requestProfile: { outputTokenField: "max_tokens" },
    });
    h.conversationModels.mockResolvedValue([
      { id: "z-ai/glm-5.3-flash", reasoning: { efforts: ["max", "high", "low"], mandatory: true } },
    ]);
    await expect(resolveNumoTurnConfiguration({ userId: "user" }))
      .resolves.toMatchObject({ model: "z-ai/glm-5.3-flash", reasoningLevel: "low" });
    expect(h.catalog).not.toHaveBeenCalled();
  });
});

describe("Numo on a personal key", () => {
  beforeEach(() => { h.route = "openrouter"; });

  it("keeps an explicit model and validates it against the provider catalog", async () => {
    await expect(resolveNumoTurnConfiguration({ userId: "user", model: "chosen-model", reasoningLevel: "high" }))
      .resolves.toMatchObject({ modelLocked: false, model: "chosen-model", reasoningLevel: "high", persistedModel: "chosen-model" });
    const resolved = await resolveNumoTurnConfiguration({ userId: "user", model: "chosen-model" });
    expect(() => assertNumoChoiceAllowed(resolved, { model: "chosen-model" })).not.toThrow();
  });

  it("rejects an unavailable model instead of falling back to the default", async () => {
    await expect(resolveNumoTurnConfiguration({ userId: "user", model: "missing-model" }))
      .rejects.toMatchObject({ code: "model_unavailable", status: 422 });
  });

  it("runs Off at the lowest level of a model that must reason (MIN-826)", async () => {
    await expect(resolveNumoTurnConfiguration({ userId: "user", model: "chosen-model", reasoningLevel: "off" }))
      .resolves.toMatchObject({ model: "chosen-model", reasoningLevel: "low" });
  });

  it("rejects a level the model does not offer", async () => {
    await expect(resolveNumoTurnConfiguration({ userId: "user", model: ADMIN_MODEL, reasoningLevel: "high" }))
      .rejects.toMatchObject({ code: "reasoning_unsupported" });
  });

  it("inherits the provider's saved default without freezing it onto the conversation", async () => {
    h.defaultModel.mockResolvedValue("chosen-model");
    await expect(resolveNumoTurnConfiguration({ userId: "user" }))
      .resolves.toMatchObject({ model: "chosen-model", persistedModel: null });
    expect(h.defaultModel).toHaveBeenCalledWith("user", "openrouter");
  });

  it("lets an explicit conversation model override the saved default", async () => {
    await resolveNumoTurnConfiguration({ userId: "user", model: "chosen-model" });
    expect(h.defaultModel).not.toHaveBeenCalled();
  });

  it("refuses a removed saved default instead of silently replacing it", async () => {
    h.defaultModel.mockResolvedValue("removed-model");
    await expect(resolveNumoTurnConfiguration({ userId: "user" })).rejects.toMatchObject({ code: "model_unavailable" });
  });

  it("runs a conversation's provider with that provider's saved model (MIN-826)", async () => {
    h.defaultModel.mockResolvedValue("chosen-model");
    const resolved = await resolveNumoTurnConfiguration({ userId: "user", provider: "anthropic" });
    expect(h.defaultModel).toHaveBeenCalledWith("user", "anthropic");
    expect(h.runtime).toHaveBeenCalledWith(expect.objectContaining({ provider: "anthropic", modelOverride: "chosen-model" }));
    expect(resolved).toMatchObject({ persistedProvider: "anthropic", model: "chosen-model" });
  });

  it("follows the instance when the personal route falls back to it", async () => {
    // The route's key no longer serves: the runtime pays with the platform key.
    h.runtime.mockImplementation(async (input: { modelOverride?: string | null }) => ({
      apiKey: "key", mode: "platform", provider: "openrouter", baseUrl: "",
      model: input.modelOverride || ADMIN_MODEL, requestProfile: { outputTokenField: "max_tokens" },
    }));
    await expect(resolveNumoTurnConfiguration({ userId: "user", model: "chosen-model", reasoningLevel: "high" }))
      .resolves.toMatchObject({ modelLocked: true, model: ADMIN_MODEL, reasoningLevel: "medium", persistedModel: null });
    expect(h.runtime).toHaveBeenLastCalledWith(expect.objectContaining({ modelOverride: null }));
  });

  it("reports a chosen provider whose key is gone instead of paying elsewhere", async () => {
    h.runtime.mockRejectedValue(new ChosenProviderUnavailableError("anthropic"));
    await expect(resolveNumoTurnConfiguration({ userId: "user", provider: "anthropic", model: "chosen-model" }))
      .rejects.toMatchObject({ code: "provider_unavailable" });
  });

  it("rejects an unknown provider", async () => {
    await expect(resolveNumoTurnConfiguration({ userId: "user", provider: "nope" }))
      .rejects.toMatchObject({ code: "invalid_provider" });
  });
});
