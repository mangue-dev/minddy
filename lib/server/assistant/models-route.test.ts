import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Round trips of GET /api/assistant/models, the Numo composer's catalog. The
 * catalog endpoint, its feature default and the preference namespace all
 * depend on the same BYOK assignment: it is read once per request, and the
 * preference read does not wait for the catalog's plan limit. The body stays
 * the same in platform and BYOK modes.
 */

const h = vi.hoisted(() => ({
  log: [] as string[],
  assignment: null as { ai_key_id: string } | null,
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
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => {
          h.log.push(table);
          if (table === "user_ai_capability_assignments") return { data: h.assignment, error: null };
          if (table === "user_ai_keys") {
            return {
              data: {
                id: "key-1", user_id: "user-1", provider: "anthropic", key_encrypted: "sealed",
                base_url: null, validated_at: "2026-01-01T00:00:00.000Z",
                updated_at: "2026-01-02T00:00:00.000Z", enabled_surfaces: null, feature_models: {},
              },
              error: null,
            };
          }
          if (table === "user_numo_preferences") {
            return { data: h.preference ? { model: h.preference } : null, error: null, status: 200 };
          }
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
  h.assignment = null;
  h.preference = null;
  h.holdPlan = false;
  h.decode.mockClear();
  h.capture.mockClear();
});

describe("GET /api/assistant/models", () => {
  it("reads the platform assignment once and the preference while the plan limit is pending", async () => {
    h.holdPlan = true;
    h.preference = "deepseek/deepseek-v4-flash";
    const response = call();
    await vi.waitFor(() => expect(h.log).toContain("plan-limit"));
    await vi.waitFor(() => expect(h.log).toContain("user_numo_preferences"));
    h.releasePlan();
    const body = await (await response).json();
    expect(body).toMatchObject({
      provider: "openrouter",
      defaultModel: "deepseek/deepseek-v4-flash",
      defaultReasoning: "off",
    });
    expect(body.models.map((model: { id: string }) => model.id)).toEqual(["deepseek/deepseek-v4-flash"]);
    expect(reads("user_ai_capability_assignments")).toBe(1);
    expect(JSON.stringify(body)).not.toContain("platform-key");
  });

  it("decodes an assigned key once and never returns it", async () => {
    h.assignment = { ai_key_id: "key-1" };
    const body = await (await call()).json();
    expect(body).toMatchObject({ provider: "anthropic", defaultModel: "app-model", models: [] });
    expect(reads("user_ai_capability_assignments")).toBe(1);
    expect(reads("user_ai_keys")).toBe(1);
    expect(h.decode).toHaveBeenCalledTimes(1);
    expect(reads("plan-limit")).toBe(0);
    expect(JSON.stringify(body)).not.toContain("sk-test");
  });
});
