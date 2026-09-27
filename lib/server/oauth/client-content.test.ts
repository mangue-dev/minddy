import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const material = new Map([[1, randomBytes(32)], [2, randomBytes(32)]]);
const store = new EncryptedStore({
  current: async () => ({ version: 2, bytes: Buffer.from(material.get(2)!) }),
  byVersion: async (_scope, version) => ({ version,
    bytes: Buffer.from(material.get(version)!) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));

const { decodeOAuthClientContent, encodeOAuthClientContent } =
  await import("./client-content");

describe("protected OAuth client registration", () => {
  it("seals every client supplied field and binds it to the client ID", async () => {
    const content = { client_name: "Private desktop client",
      redirect_uris: ["cursor://private.example/callback"],
      logo_uri: "https://private.example/logo.png",
      client_uri: "https://private.example" };
    const encoded = await encodeOAuthClientContent("client-one", content);
    expect(JSON.stringify(encoded)).not.toContain("Private desktop client");
    expect(JSON.stringify(encoded)).not.toContain("private.example");
    expect(await decodeOAuthClientContent({ client_id: "client-one",
      client_name: null, redirect_uris: null, logo_uri: null,
      client_uri: null, created_at: "", ...encoded })).toEqual(content);
    await expect(decodeOAuthClientContent({ client_id: "client-two",
      client_name: null, redirect_uris: null, logo_uri: null,
      client_uri: null, created_at: "", ...encoded })).rejects.toThrow();
    await expect(decodeOAuthClientContent({ client_id: "client-one",
      client_name: "leaked", redirect_uris: null, logo_uri: null,
      client_uri: null, created_at: "", ...encoded })).rejects.toThrow();
  });
});
