import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The decision route of an account (MIN-980): the pure rules
 * (`decisionRouteFrom`) and the settings writes, with the database, the
 * instance setting and the key catalog mocked.
 */

const h = vi.hoisted(() => ({
  config: {} as Record<string, string | null>,
  preference: null as Record<string, unknown> | null,
  keys: [] as Array<{ provider: string; validated_at: string | null }>,
  upserts: [] as Array<Record<string, unknown>>,
  catalog: [] as Array<{ id: string }>,
  managed: true,
  llmProvider: "minddy",
}));

vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValues: async () => h.config,
}));
vi.mock("@/lib/managed-services", () => ({ isManagedAiEnabled: () => h.managed }));
vi.mock("@/lib/server/model-config", () => ({
  resolveConfiguredModel: async () => ({ model: "typesafe/jev-1.13" }),
}));
vi.mock("@/lib/server/ai-runtime", () => ({
  resolveByokFeatureDefaultModel: async () => "claude-sonnet-5",
}));
vi.mock("@/lib/server/assistant/model-preferences", () => ({
  getNumoDefaultModel: async () => null,
}));
vi.mock("@/lib/server/ai-routes", () => ({
  getAiRoutes: async () => ({ assistant_model: h.llmProvider }),
}));
vi.mock("@/lib/server/agent/models-catalog", () => ({
  getActiveByokModelCatalog: async () => ({ models: h.catalog }),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: table === "user_ai_decision_preferences" ? h.preference : null, error: null }),
        upsert: async (row: Record<string, unknown>) => {
          h.upserts.push(row);
          h.preference = row;
          return { error: null };
        },
        then: (resolve: (value: unknown) => void) =>
          resolve({ data: table === "user_ai_keys" ? h.keys : [], error: null }),
      };
      return query;
    },
  }),
}));

const {
  DecisionSettingsError,
  decisionRouteFrom,
  getDecisionSettings,
  resolveDecisionRoute,
  updateDecisionSettings,
} = await import("./engine");

const NONE = { engine: null, provider: null, model: null, modelEngine: null } as const;

beforeEach(() => {
  h.config = {};
  h.preference = null;
  h.keys = [
    { provider: "openrouter", validated_at: "2026-11-01" },
    { provider: "anthropic", validated_at: "2026-11-01" },
    { provider: "openai", validated_at: null },
  ];
  h.upserts = [];
  h.catalog = [{ id: "typesafe/jev-1.13" }, { id: "liquid/d1" }];
  h.managed = true;
  h.llmProvider = "minddy";
});

const CONTEXT = {
  instanceEngine: "model" as const,
  providers: ["openrouter", "anthropic"] as const,
  llmProvider: "minddy" as const,
  managed: true,
};

describe("decisionRouteFrom", () => {
  it("follows the instance's engine until the account picks its own", () => {
    expect(decisionRouteFrom({ ...CONTEXT, instanceEngine: "llm" }, NONE).engine).toBe("llm");
    expect(decisionRouteFrom({ ...CONTEXT, instanceEngine: "llm" }, { ...NONE, engine: "model" }).engine).toBe("model");
  });

  it("defaults to the language model's provider when it can answer, then minddy Cloud", () => {
    // An OpenRouter language model keeps paying decision-model calls with its key.
    expect(decisionRouteFrom({ ...CONTEXT, llmProvider: "openrouter" }, NONE).provider).toBe("openrouter");
    // Anthropic has no decision models.
    expect(decisionRouteFrom({ ...CONTEXT, llmProvider: "anthropic" }, NONE).provider).toBe("minddy");
    expect(decisionRouteFrom({ ...CONTEXT, llmProvider: "anthropic" }, { ...NONE, engine: "llm" }).provider)
      .toBe("anthropic");
  });

  it("defaults to a key that can answer when the instance has no minddy Cloud", () => {
    const selfHosted = { ...CONTEXT, managed: false, llmProvider: "anthropic" as const };
    expect(decisionRouteFrom(selfHosted, NONE).provider).toBe("openrouter");
    expect(decisionRouteFrom({ ...selfHosted, providers: ["anthropic"] }, NONE).provider).toBeNull();
  });

  it("falls back to the default when a chosen key cannot serve the engine, or is gone", () => {
    const anthropic = { ...NONE, provider: "anthropic" as const };
    expect(decisionRouteFrom(CONTEXT, anthropic).provider).toBe("minddy");
    expect(decisionRouteFrom(CONTEXT, { ...anthropic, engine: "llm" }).provider).toBe("anthropic");
    expect(decisionRouteFrom({ ...CONTEXT, providers: [] }, { ...anthropic, engine: "llm" }).provider).toBe("minddy");
  });

  it("uses a model only on a key the account chose, under the engine it was chosen for", () => {
    const chosen = { engine: null, provider: "openrouter" as const, model: "liquid/d1", modelEngine: "model" as const };
    expect(decisionRouteFrom(CONTEXT, chosen).model).toBe("liquid/d1");
    // The administrator moved the instance to the language model: a decision
    // model id means nothing to it.
    expect(decisionRouteFrom({ ...CONTEXT, instanceEngine: "llm" }, chosen).model).toBeNull();
    expect(decisionRouteFrom(CONTEXT, { ...chosen, provider: "minddy" }).model).toBeNull();
  });
});

describe("resolveDecisionRoute", () => {
  it("follows the instance with the platform key for a call that bills no account", async () => {
    h.config = { decision_engine: "llm" };
    await expect(resolveDecisionRoute(null)).resolves.toEqual({ engine: "llm", provider: null, model: null });
  });

  it("only counts validated keys", async () => {
    h.preference = { engine: "llm", provider: "openai", model: null, model_engine: null };
    await expect(resolveDecisionRoute("user-1")).resolves.toMatchObject({ provider: "minddy" });
  });
});

describe("decision settings", () => {
  it("lists only OpenRouter among the keys for a decision model, every text key for a language model", async () => {
    const asModel = await getDecisionSettings("user-1");
    expect(asModel.providers.map((option) => option.id)).toEqual(["minddy", "openrouter"]);
    const asLlm = await updateDecisionSettings("user-1", { engine: "llm" });
    expect(asLlm.providers.map((option) => option.id)).toEqual(["minddy", "openrouter", "anthropic"]);
    expect(asLlm.engine).toBe("llm");
  });

  it("refuses a provider that cannot answer the engine", async () => {
    await expect(updateDecisionSettings("user-1", { provider: "anthropic" }))
      .rejects.toMatchObject({ code: "provider_unavailable" });
    h.managed = false;
    await expect(updateDecisionSettings("user-1", { provider: "minddy" }))
      .rejects.toBeInstanceOf(DecisionSettingsError);
    expect(h.upserts).toHaveLength(0);
  });

  it("takes a decision model on an OpenRouter key only from its catalog", async () => {
    await updateDecisionSettings("user-1", { provider: "openrouter" });
    await expect(updateDecisionSettings("user-1", { model: "openai/gpt-5" }))
      .rejects.toMatchObject({ code: "not_a_decision_model" });
    const saved = await updateDecisionSettings("user-1", { model: "liquid/d1" });
    expect(saved).toMatchObject({ provider: "openrouter", model: "liquid/d1", default_model: "typesafe/jev-1.13" });
    expect(h.preference).toMatchObject({ model: "liquid/d1", model_engine: "model" });
  });

  it("clears the model when the engine changes, and returns an incompatible key to the default", async () => {
    h.preference = { engine: "llm", provider: "anthropic", model: "claude-haiku-5", model_engine: "llm" };
    const saved = await updateDecisionSettings("user-1", { engine: "model" });
    expect(saved).toMatchObject({ engine: "model", provider: "minddy", model: null });
    expect(h.preference).toMatchObject({ provider: null, model: null, model_engine: null });
  });

  it("refuses a model on minddy Cloud, where the instance sets it", async () => {
    await expect(updateDecisionSettings("user-1", { model: "liquid/d1" }))
      .rejects.toMatchObject({ code: "model_locked" });
  });

  it("takes a model for the key shown by default, and pins that key", async () => {
    h.llmProvider = "openrouter";
    const saved = await updateDecisionSettings("user-1", { model: "liquid/d1" });
    expect(saved).toMatchObject({ provider: "openrouter", model: "liquid/d1" });
    expect(h.preference).toMatchObject({ provider: "openrouter", model: "liquid/d1" });
  });
});
