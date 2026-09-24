import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const key = Buffer.alloc(32, 49);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));

const { decodeRelayDelivery, encodeRelayDelivery } =
  await import("./delivery-content");

describe("forge relay delivery storage", () => {
  it("authenticates payload and diagnostics against the delivery identity", async () => {
    const value = "Private issue and repository content";
    const payload = await encodeRelayDelivery("instance-1", "github", "guid-1",
      "payload", value);
    const diagnostic = await encodeRelayDelivery("instance-1", "github", "guid-1",
      "last_error", value);
    expect(payload).not.toContain(value);
    expect(diagnostic).not.toContain(value);
    expect(await decodeRelayDelivery("instance-1", "github", "guid-1",
      "payload", payload)).toBe(value);
    await expect(decodeRelayDelivery("instance-2", "github", "guid-1",
      "payload", payload)).rejects.toThrow();
    await expect(decodeRelayDelivery("instance-1", "github", "guid-2",
      "payload", payload)).rejects.toThrow();
    await expect(decodeRelayDelivery("instance-1", "github", "guid-1",
      "last_error", payload)).rejects.toThrow();
  });
});
