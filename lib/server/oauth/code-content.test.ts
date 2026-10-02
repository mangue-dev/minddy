import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const material = new Map([[1, randomBytes(32)], [2, randomBytes(32)]]);
const store = new EncryptedStore({
  current: async () => ({ version: 2, bytes: Buffer.from(material.get(2)!) }),
  byVersion: async (_scope, version) => ({ version,
    bytes: Buffer.from(material.get(version)!) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));

const { decodeOAuthCodeContent, encodeOAuthCodeContent } =
  await import("./code-content");

describe("protected OAuth authorization codes", () => {
  it("seals redirects and resources under the owner and code hash", async () => {
    const row = { code_hash: "a".repeat(64), user_id: randomUUID() };
    const content = { redirect_uri: "cursor://private.example/callback",
      resource: "https://private.example/resource" };
    const encoded = await encodeOAuthCodeContent(row, content);
    expect(JSON.stringify(encoded)).not.toContain("private.example");
    expect(await decodeOAuthCodeContent({ ...row, redirect_uri: null,
      resource: null, ...encoded })).toEqual(content);
    await expect(decodeOAuthCodeContent({ ...row, code_hash: "b".repeat(64),
      redirect_uri: null, resource: null, ...encoded })).rejects.toThrow();
    await expect(decodeOAuthCodeContent({ ...row, user_id: randomUUID(),
      redirect_uri: null, resource: null, ...encoded })).rejects.toThrow();
  });
});
