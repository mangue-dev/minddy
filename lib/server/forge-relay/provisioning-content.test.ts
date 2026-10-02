import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore, type DataKeyProvider } from
  "@/lib/server/encryption/store";

const state = vi.hoisted(() => ({ store: null as EncryptedStore | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => state.store,
}));

const { encodeProvisioning, decodeProvisioning } = await import(
  "./provisioning-content");

beforeEach(() => {
  const root = randomBytes(32);
  const keys: DataKeyProvider = {
    current: async () => ({ version: 2, bytes: Buffer.from(root) }),
    byVersion: async (_scope, version) =>
      ({ version, bytes: Buffer.from(root) }),
  };
  state.store = new EncryptedStore(keys);
});

describe("relay provisioning content", () => {
  it("seals the destination, signing key and webhook secret together", async () => {
    const plain = { relay_url: "https://private-relay.example",
      signing_key: "private-ed25519-signing-key",
      webhook_secret: "private-webhook-secret" };
    const sealed = await encodeProvisioning(plain,{ force: true });
    expect(sealed).toMatchObject({ relay_url: null,
      signing_key_encrypted: null, webhook_secret_encrypted: null,
      encryption_version: 2 });
    for (const value of Object.values(plain)) {
      expect(JSON.stringify(sealed)).not.toContain(value);
    }
    expect(await decodeProvisioning(sealed)).toEqual(plain);
    await expect(decodeProvisioning({ ...sealed,
      relay_url: "https://old-writer.example" })).rejects.toThrow();
    const tampered = { ...sealed,
      encrypted_content: String(sealed.encrypted_content).replace(/.$/, "x") };
    await expect(decodeProvisioning(tampered)).rejects.toThrow();
  });
});
