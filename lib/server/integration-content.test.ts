import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const key = randomBytes(32);
const store = new EncryptedStore({
  current: async () => ({ version: 2, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));

const { decodeIntegration, encodeIntegrationField, integrationFieldVersion } =
  await import("./integration-content");

describe("protected integration fields", () => {
  it("seals labels and destinations under the project and integration identity", async () => {
    const row = { id: "integration-1", project_id: "project-1" };
    const name = await encodeIntegrationField(row, "name", "Private integration");
    const webhook = await encodeIntegrationField(row, "webhook_url",
      "https://private.example/hook");
    const stored = { ...row, name, webhook_url: webhook };
    expect(JSON.stringify(stored)).not.toContain("Private integration");
    expect(JSON.stringify(stored)).not.toContain("private.example");
    expect(integrationFieldVersion(name)).toBe(2);
    expect(await decodeIntegration(stored)).toEqual({ ...row,
      name: "Private integration", webhook_url: "https://private.example/hook" });
    await expect(decodeIntegration({ ...stored, id: "integration-2" }))
      .rejects.toThrow();
    await expect(decodeIntegration({ ...stored, project_id: "project-2" }))
      .rejects.toThrow();
  });
});
