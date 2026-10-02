import { randomBytes, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore, type DataKeyProvider } from
  "@/lib/server/encryption/store";

const state = vi.hoisted(() => ({
  store: null as EncryptedStore | null,
  rows: [] as Record<string, unknown>[],
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => state.store,
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({ order: async () => ({ data: state.rows, error: null }) }),
    }),
  }),
}));

const { encodeRelayInstance, decodeRelayInstance } = await import(
  "./instance-content");
const { listRelayInstances } = await import("./instances");

beforeEach(() => {
  state.rows = [];
  const root = randomBytes(32);
  const keys: DataKeyProvider = {
    current: async () => ({ version: 2, bytes: Buffer.from(root) }),
    byVersion: async (_scope, version) =>
      ({ version, bytes: Buffer.from(root) }),
  };
  state.store = new EncryptedStore(keys);
});

describe("relay instance content", () => {
  it("seals labels, endpoints and secrets and exposes only an admin projection", async () => {
    const row = { id: randomUUID(), name: "private relay name",
      webhook_url: "https://private-relay.example/webhook",
      webhook_secret_encrypted: "private-signing-secret",
      status: "active", created_at: "2026-09-26T00:00:00Z",
      revoked_at: null };
    const sealed = await encodeRelayInstance(row, { force: true });
    expect(sealed).toMatchObject({ name: null, webhook_url: null,
      webhook_secret_encrypted: null, encryption_version: 2 });
    for (const secret of [row.name, row.webhook_url,
      row.webhook_secret_encrypted]) {
      expect(JSON.stringify(sealed)).not.toContain(secret);
    }
    state.rows = [sealed];
    expect(await listRelayInstances()).toEqual([{ id: row.id, name: row.name,
      status: "active", created_at: row.created_at, revoked_at: null }]);
    const plain = await decodeRelayInstance(sealed);
    expect(plain.webhook_url).toBe(row.webhook_url);
    expect(plain.webhook_secret_encrypted).toBe(row.webhook_secret_encrypted);
    await expect(decodeRelayInstance({ ...sealed, id: randomUUID() }))
      .rejects.toThrow();
    await expect(decodeRelayInstance({ ...sealed,
      webhook_url: "https://old-writer.example" })).rejects.toThrow();
  });
});
