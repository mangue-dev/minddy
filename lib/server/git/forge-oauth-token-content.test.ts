import { randomBytes, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore, type DataKeyProvider } from
  "@/lib/server/encryption/store";

const state = vi.hoisted(() => ({ store: null as EncryptedStore | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => state.store,
}));

const { encodeForgeOAuthTokens, decodeForgeOAuthTokens } = await import(
  "./forge-oauth-token-content");

beforeEach(() => {
  const material = randomBytes(32);
  const keys: DataKeyProvider = {
    current: async () => ({ version: 2, bytes: Buffer.from(material) }),
    byVersion: async (_scope, version) =>
      ({ version, bytes: Buffer.from(material) }),
  };
  state.store = new EncryptedStore(keys);
});

describe("persistent forge OAuth token content", () => {
  it.each(["git_connections","git_user_identities"] as const)(
    "seals and binds the token pair in %s", async (table) => {
      const row = { id: randomUUID(), user_id: randomUUID(),
        provider: table === "git_connections" ? "gitlab" : "github",
        provider_account_id: "42" };
      const tokens = { accessToken: "private-access-token",
        refreshToken: "private-refresh-token" };
      const encoded = await encodeForgeOAuthTokens(table,row,tokens,
        { force: true });
      expect(encoded).toMatchObject({ access_token_encrypted: null,
        refresh_token_encrypted: null, encryption_version: 2 });
      expect(JSON.stringify(encoded)).not.toContain(tokens.accessToken);
      expect(JSON.stringify(encoded)).not.toContain(tokens.refreshToken);
      expect(await decodeForgeOAuthTokens(table,{ ...row,...encoded }))
        .toEqual(tokens);
      await expect(decodeForgeOAuthTokens(table,{ ...row,...encoded,
        user_id: randomUUID() })).rejects.toThrow();
      await expect(decodeForgeOAuthTokens(table,{ ...row,...encoded,
        access_token_encrypted: "old-writer" })).rejects.toThrow();
      if (table === "git_connections") {
        await expect(decodeForgeOAuthTokens(table,{ ...row,...encoded,
          provider_account_id: "another-account" })).rejects.toThrow();
      }
    });
});
