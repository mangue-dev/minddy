import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./encryption/store";

const material = new Map([[1, randomBytes(32)], [2, randomBytes(32)]]);
const store = new EncryptedStore({
  current: async () => ({ version: 2, bytes: Buffer.from(material.get(2)!) }),
  byVersion: async (_scope, version) => ({ version,
    bytes: Buffer.from(material.get(version)!) }),
});
vi.mock("./encryption/registry", () => ({ getEncryptedStore: () => store }));

const { billingFieldVersion, decodeBillingAccount, decodeBillingField,
  encodeBillingField } = await import("./billing-content");

describe("protected billing identity", () => {
  it("seals both fields and binds each value to its owner and column", async () => {
    const owner = randomUUID();
    const email = await encodeBillingField(owner, "email", "private@example.test");
    const note = await encodeBillingField(owner, "admin_override_note",
      "Private administrative reason");
    expect(JSON.stringify({ email, note })).not.toContain("private@example.test");
    expect(JSON.stringify({ email, note })).not.toContain("Private administrative reason");
    expect(billingFieldVersion(email)).toBe(2);
    expect(await decodeBillingAccount(owner, { user_id: owner, email,
      admin_override_note: note })).toMatchObject({
        email: "private@example.test",
        admin_override_note: "Private administrative reason",
      });
    await expect(decodeBillingField(randomUUID(), "email", email))
      .rejects.toThrow();
    await expect(decodeBillingField(owner, "admin_override_note", email))
      .rejects.toThrow();
    await expect(decodeBillingAccount(randomUUID(), { user_id: owner, email }))
      .rejects.toThrow();
    expect(await decodeBillingField(owner, "email", "legacy@example.test"))
      .toBe("legacy@example.test");
  });
});
