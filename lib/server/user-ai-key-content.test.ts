import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore, type DataKeyProvider } from "./encryption/store";

const holder = vi.hoisted(() => ({ store: null as EncryptedStore | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => holder.store,
}));

const { decodeUserAiKeyRow, encodeUserAiKeyRow } = await import(
  "./user-ai-key-content");

beforeEach(() => {
  const root = randomBytes(32);
  const keys: DataKeyProvider = {
    current: async () => ({ version: 1, bytes: Buffer.from(root) }),
    byVersion: async (_scope, version) =>
      ({ version, bytes: Buffer.from(root) }),
  };
  holder.store = new EncryptedStore(keys);
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("BYOK content", () => {
  it("seals the key, private endpoint and model preferences together", async () => {
    const row = {
      id: randomUUID(), user_id: randomUUID(), provider: "openrouter",
      key_encrypted: "sk-private-secret",
      base_url: "https://private-provider.example/v1",
      feature_models: { assistant: "private-model" },
      key_prefix: "sk-pr…", content_revision: 0,
    };
    const sealed = await encodeUserAiKeyRow(row, { force: true });
    expect(sealed).toMatchObject({ key_encrypted: null, base_url: null,
      feature_models: null, encryption_version: 1 });
    for (const secret of [row.key_encrypted, row.base_url, "private-model"]) {
      expect(JSON.stringify(sealed)).not.toContain(secret);
    }
    const plain = await decodeUserAiKeyRow(sealed);
    expect(plain.key_encrypted).toBe(row.key_encrypted);
    expect(plain.base_url).toBe(row.base_url);
    expect(plain.feature_models).toEqual(row.feature_models);
    await expect(decodeUserAiKeyRow({ ...sealed, id: randomUUID() }))
      .rejects.toThrow();
    await expect(decodeUserAiKeyRow({ ...sealed,
      base_url: "https://old-writer.example" }))
      .rejects.toThrow();
  });
});
