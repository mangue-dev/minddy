import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Round trips of GET /api/assistant/models, the Numo composer's catalog. The
 * Numo usage route names the default provider (MIN-826); the catalog lists
 * that provider, or the one the picker asks for. A key is decoded once and
 * never returned, and the platform plan limit is not read for a BYOK catalog.
 */

const h = vi.hoisted(() => ({
  log: [] as string[],
  route: null as { ai_key_id: string } | null,
  preference: null as string | null,
  holdPlan: false,
  releasePlan: () => {},
  decode: vi.fn(),
  capture: vi.fn(),
}));

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({ ok: true, user: { id: "user-1" }, supabase: {} }),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      const key = {
        id: "key-1", user_id: "user-1", provider: "anthropic", key_encrypted: "sealed",
        base_url: null, validated_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z", enabled_surfaces: null, feature_models: {},
      };
      const list = () => {
        h.log.push(table);
        if (table === "user_ai_surface_routes") {
          return { data: h.route ? [{ surface: "assistant", ...h.route }] : [], error: null };
        }
        if (table === "user_ai_keys") return { data: [key], error: null };
        if (table === "user_numo_preferences") {
          return { data: h.preference ? [{ provider: "minddy", model: h.preference }] : [], error: null, status: 200 };
        }
        return { data: [], error: null };
      };
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(list()).then(resolve),
        maybeSingle: async () => {
          h.log.push(table);
          if (table === "user_ai_surface_routes") return { data: h.route, error: null };
          if (table === "user_ai_keys") return { data: key, error: null };
          return { data: null, error: null };
        },
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/server/user-ai-key-content", () => ({
  decodeUserAiKeyRow: async (row: Record<string, unknown>) => {
    h.decode();
    return { ...row, key_encrypted: "sk-test" };
  },
}));
vi.mock("@/lib/server/agent/model-plan", () => ({
  getModelPlanLimit: async () => {
    h.log.push("plan-limit");
    if (h.holdPlan) await new Promise<void>((resolve) => { h.releasePlan = resolve; });
    return { planId: "go", maxMultiplier: null, baseline: null };
  },
  getBaselinePricing: async () => null,
}));
vi.mock("@/lib/server/agent/openrouter-index", () => ({
  listOpenRouterIndex: async () => [{
    id: "deepseek/deepseek-v4-flash", name: "DeepSeek", contextLength: 1000, imageInput: false,
    inputModalities: ["text"], promptCaching: false, outputModalities: ["text"], textOutput: true,
    router: false, tools: true, pricing: { inputUsdPerMTok: 1, outputUsdPerMTok: 1 },
    reasoning: null, cachePricing: null,
  }],
  getOpenRouterModelInfo: async () => null,
  loadOpenRouterIndex: async () => {},
}));
vi.mock("@/lib/server/ai-provider-request", () => ({
  fetchAiProviderBytes: async () => { throw new Error("offline"); },
}));
vi.mock("@/lib/server/app-config", () => ({ getAppConfigValue: async () => null }));
vi.mock("@/lib/server/ai-runtime", () => ({ resolveByokFeatureDefaultModel: async () => "app-model" }));
vi.mock("@/lib/server/assistant/reasoning", () => ({ getAssistantReasoningLevel: async () => "off" }));
vi.mock("@/lib/server/error-tracking", () => ({ captureServerException: h.capture }));
vi.mock("@/lib/managed-services", () => ({ isManagedAiEnabled: () => true }));

vi.stubEnv("OPENROUTER_API_KEY", "platform-key");
const { GET } = await import("@/app/api/assistant/models/route");

const call = () => GET(new NextRequest("https://minddy.test/api/assistant/models"));
const reads = (table: string) => h.log.filter((entry) => entry === table).length;

beforeEach(() => {
  h.log = [];
  h.route = null;
  h.preference = null;
  h.holdPlan = false;
  h.decode.mockClear();
  h.capture.mockClear();
});

describe("GET /api/assistant/models", () => {
  it("lists minddy Cloud with the saved model when Numo has no route", async () => {
    h.preference = "deepseek/deepseek-v4-flash";
    const body = await (await call()).json();
    expect(body).toMatchObject({
      provider: "openrouter",
      providerChoice: "minddy",
      defaultProvider: "minddy",
      defaultModel: "deepseek/deepseek-v4-flash",
      defaultReasoning: "off",
    });
    expect(body.models.map((model: { id: string }) => model.id)).toEqual(["deepseek/deepseek-v4-flash"]);
    expect(reads("plan-limit")).toBe(1);
    expect(JSON.stringify(body)).not.toContain("platform-key");
  });

  it("decodes the routed key once and never returns it", async () => {
    h.route = { ai_key_id: "key-1" };
    const body = await (await call()).json();
    expect(body).toMatchObject({ provider: "anthropic", providerChoice: "anthropic", defaultModel: "app-model", models: [] });
    expect(h.decode).toHaveBeenCalledTimes(1);
    expect(reads("plan-limit")).toBe(0);
    expect(JSON.stringify(body)).not.toContain("sk-test");
  });

  it("lists another provider's models on request", async () => {
    h.route = { ai_key_id: "key-1" };
    const body = await (await GET(new NextRequest("https://minddy.test/api/assistant/models?provider=minddy"))).json();
    expect(body).toMatchObject({ provider: "openrouter", providerChoice: "minddy", defaultProvider: "anthropic" });
    expect(h.decode).not.toHaveBeenCalled();
  });
});
