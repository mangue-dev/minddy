import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Per-usage provider routes (MIN-826), on an in-memory database: a usage is
 * served by the credential its route names, minddy Cloud otherwise, and each
 * usage moves alone.
 */

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  tables: { user_ai_keys: [] as Row[], user_ai_surface_routes: [] as Row[] } as Record<string, Row[]>,
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
          entry.user_id === row.user_id && entry.surface === row.surface);
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
  routeUnservedSurfaces,
  setAiRoute,
} = await import("./ai-routes");

const key = (provider: string, extra: Row = {}): Row => ({
  id: `key-${provider}`, user_id: "user", provider, key_encrypted: "sealed", base_url: null,
  validated_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
  enabled_surfaces: [], feature_models: {}, ...extra,
});

beforeEach(() => {
  h.tables = { user_ai_keys: [key("anthropic"), key("openai")], user_ai_surface_routes: [] };
  h.managed = true;
});

describe("usage routes", () => {
  it("serves each usage from its own route, and minddy Cloud without one", async () => {
    await setAiRoute("user", "assistant", "anthropic");
    expect((await getUserByok("user", "assistant"))?.provider).toBe("anthropic");
    expect(await getUserByok("user", "automations")).toBeNull();
    expect(await getAiRoutes("user")).toEqual({
      assistant: "anthropic", automations: "minddy", voice: "minddy", feedback: "minddy",
    });
  });

  it("keeps a capability the routed provider lacks on minddy Cloud", async () => {
    await setAiRoute("user", "voice", "anthropic");
    expect((await getUserByok("user", "voice", "text"))?.provider).toBe("anthropic");
    expect(await getUserByok("user", "voice", "transcription")).toBeNull();
    const options = await getAiProviderOptions("user", "voice");
    expect(options.find((option) => option.id === "anthropic")?.fallbackCapabilities).toEqual(["transcription"]);
    expect(options.find((option) => option.id === "openai")?.fallbackCapabilities).toEqual([]);
  });

  it("serves a provider chosen explicitly, whatever the routes say", async () => {
    expect((await getUserByokForProvider("user", "openai"))?.apiKey).toBe("plain-openai");
    expect(await getUserByokForProvider("user", "google")).toBeNull();
  });

  it("moves a usage back to minddy Cloud and refuses providers it cannot use", async () => {
    await setAiRoute("user", "feedback", "openai");
    await setAiRoute("user", "feedback", "minddy");
    expect(h.tables.user_ai_surface_routes).toEqual([]);
    await expect(setAiRoute("user", "feedback", "google")).rejects.toBeInstanceOf(AiRouteError);
    h.tables.user_ai_keys!.push(key("ollama"));
    await expect(setAiRoute("user", "assistant", "ollama")).rejects.toBeInstanceOf(AiRouteError);
    h.tables.user_ai_keys!.push(key("google", { validated_at: null }));
    await expect(setAiRoute("user", "assistant", "google")).rejects.toBeInstanceOf(AiRouteError);
  });

  it("offers minddy Cloud only where the instance provides it", async () => {
    expect((await getAiProviderOptions("user", "assistant")).map((option) => option.id))
      .toEqual(["minddy", "anthropic", "openai"]);
    h.managed = false;
    expect((await getAiProviderOptions("user", "assistant")).map((option) => option.id))
      .toEqual(["anthropic", "openai"]);
    await expect(setAiRoute("user", "assistant", "minddy")).rejects.toBeInstanceOf(AiRouteError);
  });

  it("routes a new credential to the unrouted usages only without minddy Cloud", async () => {
    await routeUnservedSurfaces("user", "anthropic");
    expect(h.tables.user_ai_surface_routes).toEqual([]);
    h.managed = false;
    await setAiRoute("user", "assistant", "openai");
    await routeUnservedSurfaces("user", "anthropic");
    expect(await getAiRoutes("user")).toEqual({
      assistant: "openai", automations: "anthropic", voice: "anthropic", feedback: "anthropic",
    });
  });
});
