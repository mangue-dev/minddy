import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const material = new Map([[1, randomBytes(32)], [2, randomBytes(32)]]);
const store = new EncryptedStore({
  current: async () => ({ version: 2, bytes: Buffer.from(material.get(2)!) }),
  byVersion: async (_scope, version) => ({ version,
    bytes: Buffer.from(material.get(version)!) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => store,
  getBlindIndexKeys: () => ({
    current: async () => ({ version: 1, bytes: randomBytes(32) }),
    byVersion: async () => ({ version: 1, bytes: Buffer.alloc(32, 7) }),
  }),
}));

const { openPush, pushDevice, pushIndex, pushVersion, sealPush } =
  await import("./content");

describe("protected push registration content", () => {
  it("seals all destination and device fields without a clear copy", async () => {
    const endpoint = "https://private.example/push";
    const digest = await pushIndex(endpoint, "endpoint");
    const content = { endpoint, p256dh: "private-key", auth: "private-auth",
      native_installation_id: null, device_label: "Private device",
      user_agent: "Private browser" };
    const encrypted_content = await sealPush({ user_id: "user-1",
      endpoint_digest: digest }, content);
    const stored = { id: "subscription-1", user_id: "user-1",
      endpoint_digest: digest, encrypted_content,
      endpoint: null, p256dh: null, auth: null, native_installation_id: null,
      device_label: null, user_agent: null };
    expect(JSON.stringify(stored)).not.toContain("private.example");
    expect(JSON.stringify(stored)).not.toContain("private-auth");
    expect(JSON.stringify(stored)).not.toContain("Private device");
    expect(pushVersion(encrypted_content)).toBe(2);
    expect(await openPush(stored)).toMatchObject(content);
    expect(pushDevice(await openPush(stored))).not.toHaveProperty("auth");
    await expect(openPush({ ...stored, user_id: "user-2" })).rejects.toThrow();
    await expect(openPush({ ...stored, endpoint_digest: "wrong" })).rejects.toThrow();
    await expect(openPush({ ...stored, endpoint })).rejects.toThrow();
  });
});
