import { PlanLimitError } from "@/lib/server/plan-limit-error";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
const h = vi.hoisted(() => ({ user: "owner", provider: "minddy", authenticated: true,
  routes: new Map<string, string>(),
  rows: new Map<string, string | null>(), reads: [] as string[], writes: [] as Record<string, unknown>[],
  readError: false, blockedModel: false,
  readCode: "PGRST205", capture: vi.fn(),
}));
function database() {
  return { from: (table: string) => {
    expect(table).toBe("user_numo_preferences");
    const filters: Record<string, string | string[]> = {};
    const result = () => {
      const providers = [filters.provider].flat();
      const data = providers.flatMap((provider) => {
        const id = `${filters.user_id}:${provider}`; h.reads.push(id);
        return h.rows.has(id) ? [{ provider, model: h.rows.get(id) }] : [];
      });
      return { data,
        error: h.readError ? { code: h.readCode, message: "Private database response", details: "private-row" } : null,
        status: h.readError ? 503 : 200 };
    };
    const q = { select: () => q, eq: (key: string, value: string) => { filters[key] = value; return q; },
      in: (key: string, values: string[]) => { filters[key] = values; return q; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
      upsert: async (row: Record<string, unknown>) => {
        h.writes.push(row); h.rows.set(`${row.user_id}:${row.provider}`, row.model as string | null);
        return { error: null };
      },
    }; return q;
  } };
}
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => database() }));
vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser: async () => h.authenticated
  ? { ok: true, user: { id: h.user }, supabase: database() }
  : { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) } }));
// The Numo usage route decides the default provider; minddy Cloud has no route.
vi.mock("@/lib/server/ai-routes", () => ({
  getAiRoutes: async (user: string) => ({ assistant: h.routes.get(user) ?? h.provider }),
  getAiProviderOptions: async () => [{ id: "minddy", label: "minddy Cloud", fallbackCapabilities: [] }],
  setAiRoute: async (user: string, _surface: string, provider: string) => { h.routes.set(user, provider); },
  AiRouteError: class extends Error {},
}));
vi.mock("@/lib/server/ai-runtime", () => ({
  resolveByokFeatureDefaultModel: async (provider: string) => provider === "generic" ? null : "app-model",
  resolveAiRuntime: async ({ modelOverride, provider }: { modelOverride?: string | null; provider?: string | null }) => {
    const chosen = provider ?? h.provider;
    return { provider: chosen === "minddy" ? "openrouter" : chosen,
      mode: chosen === "minddy" ? "platform" : "byok", model: modelOverride ?? "app-model", apiKey: "fixture" };
  },
}));
vi.mock("@/lib/server/agent/models-catalog", () => ({ getOpenRouterConversationModels: async () => [{ id: "allowed" }],
  getAssistantModelsForUser: async () => ({ models: h.provider === "generic" ? [] : [{ id: "allowed" }] }) }));
vi.mock("@/lib/server/assistant/reasoning", () => ({ getAssistantReasoningLevel: async () => "off" }));
vi.mock("@/lib/server/error-tracking", () => ({ captureServerException: h.capture }));
vi.mock("@/lib/server/agent/model-plan", () => ({ ensureModelInPlan: async () => {
  if (h.blockedModel) throw new PlanLimitError("model_above_plan");
} }));
const { GET, PUT } = await import("@/app/api/account/numo-preferences/route");
const { getNumoPreferences } = await import("./model-preferences");
const { GET: getModels } = await import("@/app/api/assistant/models/route");
const request = (body?: unknown) => new Request("http://localhost/api/account/numo-preferences", {
  method: body === undefined ? "GET" : "PUT", ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}) as Parameters<typeof GET>[0];
beforeEach(() => {
  h.user = "owner"; h.provider = "minddy"; h.routes.clear(); h.authenticated = true; h.readError = false;
  h.blockedModel = false; h.rows.clear(); h.reads = []; h.writes = [];
  h.readCode = "PGRST205"; h.capture.mockReset();
});
describe("personal Numo preferences", () => {
  it("persists and reloads an owner's choice while isolating another account", async () => {
    expect((await PUT(request({ provider: "minddy", default_model: "allowed", user_id: "other" }))).status).toBe(200);
    expect(await (await GET(request())).json()).toMatchObject({ default_model: "allowed", application_model: "app-model" });
    expect(h.writes[0]).toMatchObject({ user_id: "owner", provider: "minddy", model: "allowed" });
    h.user = "other";
    expect(await (await GET(request())).json()).toMatchObject({ default_model: null });
  });
  it("keeps separate provider namespaces and restores their previous defaults", async () => {
    h.rows.set("owner:minddy", "allowed"); h.rows.set("owner:anthropic", "claude-choice");
    h.provider = "anthropic";
    expect(await getNumoPreferences("owner")).toMatchObject({ provider: "anthropic", default_model: "claude-choice" });
    h.provider = "minddy";
    expect(await getNumoPreferences("owner")).toMatchObject({ provider: "minddy", default_model: "allowed" });
  });

  it("reads minddy Cloud's pre-MIN-826 model, saved under openrouter", async () => {
    h.rows.set("owner:openrouter", "legacy");
    expect(await getNumoPreferences("owner")).toMatchObject({ provider: "minddy", default_model: "legacy" });
    // A personal OpenRouter key never reads minddy Cloud's row, and the reverse.
    h.rows.set("owner:minddy", "cloud");
    expect(await getNumoPreferences("owner")).toMatchObject({ default_model: "cloud" });
  });
  it("clears a stale choice without requiring a functioning model catalog", async () => {
    h.rows.set("owner:minddy", "removed");
    expect((await PUT(request({ provider: "minddy", default_model: null }))).status).toBe(200);
    expect(await (await GET(request())).json()).toMatchObject({ default_model: null });
  });
  it("routes Numo to the provider chosen with its model (MIN-826)", async () => {
    expect((await PUT(request({ provider: "anthropic", default_model: "allowed" }))).status).toBe(200);
    expect(h.routes.get("owner")).toBe("anthropic");
    expect(h.writes[0]).toMatchObject({ provider: "anthropic", model: "allowed" });
    expect(await (await GET(request())).json()).toMatchObject({ provider: "anthropic", default_model: "allowed" });
  });
  it.each([[], null, { provider: "minddy", default_model: "" }, { provider: "minddy", default_model: "bad model" },
    { provider: "unknown", default_model: null }])("rejects malformed preference %j", async (body) => {
    expect((await PUT(request(body))).status).toBe(400); expect(h.writes).toHaveLength(0);
  });
  it("rejects unavailable models before saving", async () => {
    expect((await PUT(request({ provider: "minddy", default_model: "missing" }))).status).toBe(422);
    expect(h.writes).toHaveLength(0);
  });
  it("allows a generic endpoint's explicit custom model without an application default", async () => {
    h.provider = "generic";
    expect((await PUT(request({ provider: "generic", default_model: "custom" }))).status).toBe(200);
    expect(await (await GET(request())).json()).toMatchObject({ default_model: "custom", application_model: null });
  });
  it("does not save a model that fails admission", async () => {
    h.blockedModel = true;
    expect((await PUT(request({ provider: "minddy", default_model: "allowed" }))).status).toBe(403);
    expect(h.writes).toHaveLength(0);
  });
  it("does not silently reset a preference when storage is unavailable", async () => {
    h.readError = true;
    expect((await GET(request())).status).toBe(503);
    expect(h.capture).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ operation: "read_numo_preferences" }),
      null,
      { routePath: "/api/account/numo-preferences", routeType: "route", httpMethod: "GET" },
    );
  });
  it.each(["PGRST205", "42501", "57014"])("keeps model discovery available after a %s preference read failure", async (code) => {
    h.readError = true; h.readCode = code;
    const response = await getModels(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ models: [{ id: "allowed" }], defaultModel: null, defaultReasoning: "off" });
    expect(h.capture).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      operation: "read_numo_preferences", diagnostics: expect.objectContaining({ code, status: 503 }),
    }), null, { routePath: "/api/assistant/models", routeType: "route", httpMethod: "GET" });
    expect(JSON.stringify(h.capture.mock.calls)).not.toContain("private-row");
    await expect(getNumoPreferences("owner")).rejects.toMatchObject({ operation: "read_numo_preferences" });
    expect((await GET(request())).status).toBe(503);
  });
  it("uses the personal model in the catalog and the application default when no preference is saved", async () => {
    h.rows.set("owner:minddy", "allowed");
    expect(await (await getModels(request())).json()).toMatchObject({ defaultModel: "allowed" });
    h.rows.clear();
    expect(await (await getModels(request())).json()).toMatchObject({ defaultModel: "app-model" });
    expect(h.capture).not.toHaveBeenCalled();
  });
  it("requires authentication for reads and writes", async () => {
    h.authenticated = false;
    expect((await GET(request())).status).toBe(401);
    expect((await getModels(request())).status).toBe(401);
    expect((await PUT(request({ provider: "minddy", default_model: null }))).status).toBe(401);
    expect(h.writes).toHaveLength(0);
  });
});
