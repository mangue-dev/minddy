import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Per-usage provider routes (MIN-826), on an in-memory database: a usage is
 * served by the credential its route names, minddy Cloud otherwise, and each
 * usage moves alone.
 */

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  tables: { user_ai_keys: [] as Row[], user_ai_usage_routes: [] as Row[] } as Record<string, Row[]>,
  managed: true,
}));

function table(name: string) {
  const filters: Array<[string, unknown]> = [];
  const matches = (row: Row) => filters.every(([key, value]) =>
    Array.isArray(value) ? value.includes(row[key]) : row[key] === value);
  const rows = () => (h.tables[name] ??= []).filter(matches);
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
    in: (key: string, values: unknown[]) => { filters.push([key, values]); return query; },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
    delete: () => ({
      eq: (key: string, value: unknown) => {
        filters.push([key, value]);
        return { eq: async (k2: string, v2: unknown) => {
          filters.push([k2, v2]);
          h.tables[name] = (h.tables[name] ?? []).filter((row) => !matches(row));
          return { error: null };
        } };
      },
    }),
    upsert: async (input: Row | Row[], options?: { ignoreDuplicates?: boolean }) => {
      for (const row of [input].flat()) {
        const existing = (h.tables[name] ??= []).findIndex((entry) =>
          entry.user_id === row.user_id && entry.usage_key === row.usage_key);
        if (existing >= 0 && options?.ignoreDuplicates) continue;
        if (existing >= 0) h.tables[name]![existing] = { ...h.tables[name]![existing], ...row };
        else h.tables[name]!.push(row);
      }
      return { error: null };
    },
  };
  return query;
}

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ from: table }) }));
vi.mock("@/lib/server/user-ai-key-content", () => ({
  decodeUserAiKeyRow: async (row: Row) => ({ ...row, key_encrypted: `plain-${row.provider}` }),
}));
vi.mock("@/lib/managed-services", () => ({ isManagedAiEnabled: () => h.managed }));
vi.mock("@/lib/server/safe-fetch", () => ({ assertPublicHttpUrl: async () => {} }));

const { getUserByok, getUserByokForProvider } = await import("./agent/model");
const {
  AiRouteError,
  getAiProviderOptions,
  getAiRoutes,
  routeUnservedUsages,
  setAiRoute,
} = await import("./ai-routes");

const key = (provider: string, extra: Row = {}): Row => ({
  id: `key-${provider}`, user_id: "user", provider, key_encrypted: "sealed", base_url: null,
  validated_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
  enabled_surfaces: [], feature_models: {}, ...extra,
});

beforeEach(() => {
  h.tables = { user_ai_keys: [key("anthropic"), key("openai")], user_ai_usage_routes: [] };
  h.managed = true;
});

const ids = (options: Array<{ id: string }>) => options.map((option) => option.id);

describe("call-type routes", () => {
  it("serves every call type of a role from the role's route (MIN-954)", async () => {
    await setAiRoute("user", "assistant_model", "anthropic");
    // The language model serves Numo and every text call type alike.
    expect((await getUserByok("user", "assistant", "text", "assistant_model"))?.provider).toBe("anthropic");
    expect((await getUserByok("user", "assistant", "text", "conversation_title_model"))?.provider).toBe("anthropic");
    expect((await getUserByok("user", "automations"))?.provider).toBe("anthropic");
    // Embeddings and speech to text keep their own route: none here.
    expect(await getUserByok("user", "automations", "embedding", "issue_embedding_model")).toBeNull();
    const routes = await getAiRoutes("user");
    expect(routes.conversation_title_model).toBe("anthropic");
    expect(routes.feedback_embedding_model).toBe("minddy");
  });

  it("ignores a route saved for a single call type before MIN-954", async () => {
    h.tables.user_ai_usage_routes = [{ user_id: "user", usage_key: "smart_fill_model", ai_key_id: "key-anthropic" }];
    expect(await getUserByok("user", "automations", "text", "smart_fill_model")).toBeNull();
    expect((await getAiRoutes("user")).smart_fill_model).toBe("minddy");
  });

  it("offers only the providers that can serve a call type", async () => {
    expect(ids(await getAiProviderOptions("user", "smart_fill_model"))).toEqual(["minddy", "anthropic", "openai"]);
    expect(ids(await getAiProviderOptions("user", "transcription_model"))).toEqual(["minddy", "openai"]);
    expect(ids(await getAiProviderOptions("user", "issue_embedding_model"))).toEqual(["minddy", "openai"]);
    // Web search runs on OpenRouter's web plugin.
    expect(ids(await getAiProviderOptions("user", "web_search_model"))).toEqual(["minddy"]);
    h.tables.user_ai_keys!.push(key("openrouter"));
    expect(ids(await getAiProviderOptions("user", "web_search_model"))).toEqual(["minddy", "openrouter"]);
  });

  it("serves a provider chosen explicitly, whatever the routes say", async () => {
    expect((await getUserByokForProvider("user", "openai"))?.apiKey).toBe("plain-openai");
    expect(await getUserByokForProvider("user", "google")).toBeNull();
  });

  it("moves a role back to minddy Cloud and refuses providers that cannot serve it", async () => {
    // A call type's route is its role's.
    await setAiRoute("user", "feedback_analysis_model", "openai");
    expect(h.tables.user_ai_usage_routes).toEqual([
      expect.objectContaining({ usage_key: "assistant_model", ai_key_id: "key-openai" }),
    ]);
    await setAiRoute("user", "feedback_analysis_model", "minddy");
    expect(h.tables.user_ai_usage_routes).toEqual([]);
    await expect(setAiRoute("user", "feedback_analysis_model", "google")).rejects.toBeInstanceOf(AiRouteError);
    await expect(setAiRoute("user", "transcription_model", "anthropic")).rejects.toBeInstanceOf(AiRouteError);
    h.tables.user_ai_keys!.push(key("ollama"));
    await expect(setAiRoute("user", "assistant_model", "ollama")).rejects.toBeInstanceOf(AiRouteError);
    h.tables.user_ai_keys!.push(key("google", { validated_at: null }));
    await expect(setAiRoute("user", "assistant_model", "google")).rejects.toBeInstanceOf(AiRouteError);
  });

  it("offers minddy Cloud only where the instance provides it", async () => {
    h.managed = false;
    expect(ids(await getAiProviderOptions("user", "assistant_model"))).toEqual(["anthropic", "openai"]);
    await expect(setAiRoute("user", "assistant_model", "minddy")).rejects.toBeInstanceOf(AiRouteError);
  });

  it("routes a new credential to the unrouted call types only without minddy Cloud", async () => {
    await routeUnservedUsages("user", "anthropic");
    expect(h.tables.user_ai_usage_routes).toEqual([]);
    h.managed = false;
    await setAiRoute("user", "assistant_model", "openai");
    await routeUnservedUsages("user", "anthropic");
    const routes = await getAiRoutes("user");
    expect(routes.assistant_model).toBe("openai");
    expect(routes.smart_fill_model).toBe("openai");
    // Anthropic cannot transcribe nor embed: those roles keep no provider.
    expect(routes.transcription_model).toBe("minddy");
    expect(h.tables.user_ai_usage_routes).toHaveLength(1);
  });
});
