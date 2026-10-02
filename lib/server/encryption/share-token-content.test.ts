import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./store";

const contentKey = Buffer.alloc(32, 19);
const indexKey = Buffer.alloc(32, 29);
vi.mock("./registry", () => ({
  getEncryptedStore: () => new EncryptedStore({
    current: async () => ({ version: 2, bytes: Buffer.from(contentKey) }),
    byVersion: async (_scope: unknown, version: number) => {
      if (version !== 2) throw new Error("Unknown key version");
      return { version, bytes: Buffer.from(contentKey) };
    },
  }),
  getBlindIndexKeys: () => ({
    current: async () => ({ version: 1, bytes: Buffer.from(indexKey) }),
    byVersion: async () => ({ version: 1, bytes: Buffer.from(indexKey) }),
  }),
}));

import { decodeShareToken, encodeShareToken, shareTokenLookup,
  shareTokenState } from "./share-token-content";

describe("recoverable share tokens", () => {
  it("stores only ciphertext, keeps equality stable, and binds the row and key", async () => {
    const id = "00000000-0000-0000-0000-000000000101";
    const token = "private-share-token-123";
    const ciphertext = await encodeShareToken(id, token);
    expect(ciphertext).toMatch(/^mdys3:2:/);
    expect(ciphertext).not.toContain(token);
    expect(shareTokenState(ciphertext)).toEqual({ version: 2, format: 3 });
    expect(await decodeShareToken(id, ciphertext)).toBe(token);
    await expect(decodeShareToken("00000000-0000-0000-0000-000000000102",
      ciphertext)).rejects.toThrow();
    expect(await shareTokenLookup(token)).toBe(await shareTokenLookup(token));
    expect(await shareTokenLookup(token)).not.toBe(await shareTokenLookup("other"));
    await expect(decodeShareToken(id, ciphertext.replace("mdys3:2:",
      "mdys3:1:"))).rejects.toThrow();
  });
});
