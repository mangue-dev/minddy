import { randomBytes, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore, type DataKeyProvider } from "./encryption/store";

const state = vi.hoisted(() => ({
  store: null as EncryptedStore | null,
  row: null as Record<string, unknown> | null,
  filters: [] as Array<[string, unknown]>,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({ ok: true, user: { id: state.row?.user_id } }),
}));
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => state.store,
}));
vi.mock("@/lib/server/ai-runtime", () => ({
  resolveByokFeatureDefaultModel: async () => null,
}));

function query(data: unknown) {
  const chain = {
    select: () => chain,
    eq: (column: string, value: unknown) => {
      state.filters.push([column, value]);
      return chain;
    },
    order: async () => ({ data, error: null }),
    then: (resolve: (value: unknown) => unknown) =>
      resolve({ data, error: null }),
  };
  return chain;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => query(table === "user_ai_keys"
      ? [state.row] : []),
  }),
}));

const { encodeUserAiKeyRow } = await import("./user-ai-key-content");
const { GET } = await import("@/app/api/account/ai-keys/route");

beforeEach(() => {
  state.filters = [];
  const root = randomBytes(32);
  const keys: DataKeyProvider = {
    current: async () => ({ version: 2, bytes: Buffer.from(root) }),
    byVersion: async (_scope, version) =>
      ({ version, bytes: Buffer.from(root) }),
  };
  state.store = new EncryptedStore(keys);
});

describe("BYOK account projection", () => {
  it("returns private preferences only to the owner and omits the credential", async () => {
    const owner = randomUUID();
    state.row = await encodeUserAiKeyRow({
      id: randomUUID(), user_id: owner, provider: "openrouter",
      key_encrypted: "sk-highly-private-secret",
      key_prefix: "sk-h…", base_url: "https://private-model.example/v1",
      feature_models: { assistant: "private-model" },
      enabled_surfaces: ["agent"], created_at: "2026-09-26T00:00:00Z",
      updated_at: "2026-09-26T00:00:00Z", last_used_at: null,
      validated_at: null,
    }, { force: true });
    const response = await GET(new Request("https://minddy.example/api/account/ai-keys") as never);
    expect(response.status).toBe(200);
    expect(state.filters).toContainEqual(["user_id", owner]);
    const body = await response.json();
    expect(body.keys[0].base_url).toBe("https://private-model.example/v1");
    expect(body.keys[0].feature_models).toEqual({ assistant: "private-model" });
    expect(JSON.stringify(body)).not.toContain("sk-highly-private-secret");
    expect(JSON.stringify(body)).not.toContain("encrypted_content");
  });
});
