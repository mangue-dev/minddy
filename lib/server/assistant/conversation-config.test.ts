import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  runtime: vi.fn(),
  catalog: vi.fn(),
  plan: vi.fn(),
  defaultReasoning: vi.fn(),
}));

vi.mock("@/lib/server/ai-runtime", () => ({
  resolveAiRuntime: h.runtime,
  ManagedAiUnavailableError: class extends Error {},
}));
vi.mock("@/lib/server/agent/models-catalog", () => ({
  getAssistantModelsForUser: h.catalog,
}));
vi.mock("@/lib/server/agent/model-plan", () => ({ ensureModelInPlan: h.plan }));
vi.mock("@/lib/server/assistant/reasoning", () => ({
  getAssistantReasoningLevel: h.defaultReasoning,
}));

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
});

describe("Numo conversation configuration", () => {
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

  it("rejects a reasoning level the selected model does not support", async () => {
    await expect(resolveNumoTurnConfiguration({
      userId: "user",
      model: "chosen-model",
      reasoningLevel: "off",
    })).rejects.toMatchObject({ code: "reasoning_unsupported", status: 422 });
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

  it("keeps legacy conversations on the account default when no override is stored", async () => {
    const resolved = await resolveNumoTurnConfiguration({ userId: "user" });

    expect(resolved).toMatchObject({
      model: "account-default",
      reasoningLevel: "medium",
      persistedModel: null,
      persistedReasoningLevel: null,
    });
    expect(h.catalog).not.toHaveBeenCalled();
  });
});
