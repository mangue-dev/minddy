import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  writes: [] as Array<{ id: string; patch: Record<string, unknown> }>,
}));
vi.mock("server-only", () => ({}));
vi.mock("./content-config", () => ({ isContentEncryptionEnabled: () => true }));
vi.mock("./registry", () => ({
  getContentKeys: () => ({
    current: async () => ({ version: 1, bytes: Buffer.alloc(32) }),
  }),
  getEncryptedStore: () => ({
    fromDatabase: (value: string) => value,
    formatOf: () => 3,
  }),
}));
vi.mock("@/lib/server/user-ai-key-content", () => ({
  decodeUserAiKeyRow: async (row: Record<string, unknown>) => ({
    ...row, key_encrypted: "private-key", base_url: "https://private.example",
    feature_models: { assistant: "private-model" },
  }),
  encodeUserAiKeyRow: async (row: Record<string, unknown>) => ({
    ...row, key_encrypted: null, base_url: null, feature_models: null,
    encrypted_content: "opaque", encryption_version: 1,
  }),
}));

const rows = [
  { id: "corrupt", user_id: null, content_revision: 0,
    encryption_version: 0, encrypted_content: null },
  { id: "healthy", user_id: "owner", content_revision: 0,
    encryption_version: 0, encrypted_content: null },
];
function query() {
  let patch: Record<string, unknown> | null = null;
  let id = "";
  const chain = {
    select: () => chain,
    order: () => chain,
    limit: async () => ({ data: rows, error: null }),
    update: (next: Record<string, unknown>) => { patch = next; return chain; },
    eq: (column: string, value: unknown) => {
      if (column === "id") id = String(value);
      return chain;
    },
    maybeSingle: async () => {
      if (patch) state.writes.push({ id, patch });
      return { data: { id }, error: null };
    },
    then: (resolve: (value: unknown) => unknown) => {
      if (patch) state.writes.push({ id, patch });
      return resolve({ data: { id }, error: null });
    },
  };
  return chain;
}
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: () => query() }),
}));

const { backfillUserAiKeysBatch } = await import("./user-ai-key-backfill");

beforeEach(() => {
  state.writes = [];
  vi.stubEnv("MINDDY_USER_AI_KEY_ENCRYPTION_ENABLED", "true");
});

describe("BYOK backfill fairness", () => {
  it("marks a failed attempt without marking it verified and continues the batch", async () => {
    const result = await backfillUserAiKeysBatch(2);
    expect(result).toMatchObject({ scanned: 2, failed: 1, migrated: 1 });
    expect(state.writes[0]).toMatchObject({ id: "corrupt",
      patch: { encryption_attempted_at: expect.any(String) } });
    expect(state.writes[0]?.patch).not.toHaveProperty("encryption_checked_at");
    expect(state.writes[1]).toMatchObject({ id: "healthy",
      patch: { encrypted_content: "opaque", encryption_version: 1,
        encryption_checked_at: expect.any(String) } });
  });
});
