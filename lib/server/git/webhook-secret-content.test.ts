import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore, type DataKeyProvider } from
  "@/lib/server/encryption/store";

const holder = vi.hoisted(() => ({ store: null as EncryptedStore | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => holder.store,
}));

const { decodeRepoWebhookSecret, encodeRepoWebhookSecret,
  protectedWebhookSecretVersion } = await import("./webhook-secret-content");

beforeEach(() => {
  const root = randomBytes(32);
  const keys: DataKeyProvider = {
    current: async () => ({ version: 2, bytes: Buffer.from(root) }),
    byVersion: async (_scope, version) =>
      ({ version, bytes: Buffer.from(root) }),
  };
  holder.store = new EncryptedStore(keys);
});

describe("shared repository webhook secret", () => {
  it("seals a secret once for all links to the same repository", async () => {
    const secret = "private-hook-secret-0123456789abcdef";
    const cipher = await encodeRepoWebhookSecret(secret,"gitlab","42",
      { force: true });
    expect(cipher).not.toContain(secret);
    expect(protectedWebhookSecretVersion(cipher)).toBe(2);
    expect(await decodeRepoWebhookSecret(cipher,"gitlab","42"))
      .toBe(secret);
    expect(await decodeRepoWebhookSecret(cipher,"gitlab","43"))
      .toBeNull();
    expect(await decodeRepoWebhookSecret(cipher,"github","42"))
      .toBeNull();
  });
});
