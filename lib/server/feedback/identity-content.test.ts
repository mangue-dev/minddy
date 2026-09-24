import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const key = Buffer.alloc(32, 94);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) =>
    ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => store,
  getBlindIndexKeys: () => ({
    current: async () => ({ version: 1, bytes: Buffer.from(key) }),
    byVersion: async (_scope: unknown, version: number) =>
      ({ version, bytes: Buffer.from(key) }),
  }),
}));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));
const { encodeFeedbackIdentity, decodeFeedbackIdentityRow,
  feedbackIdentityLookup, feedbackOtpEmailLookup,
  encodeFeedbackOtpEmail, decodeFeedbackOtpEmail } =
  await import("./identity-content");

describe("private feedback identities", () => {
  it("binds identity fields to project, row and column with separate blind lookups", async () => {
    const email = "private@example.test";
    const cipher = await encodeFeedbackIdentity("project-1", "visitor-1",
      "email", email);
    const name = await encodeFeedbackIdentity("project-1", "visitor-1",
      "name", "Private Visitor");
    expect(cipher).not.toContain(email);
    const row = await decodeFeedbackIdentityRow({ id: "visitor-1",
      project_id: "project-1", email: cipher, name }, "project-1");
    expect(row).toMatchObject({ email, name: "Private Visitor" });
    await expect(decodeFeedbackIdentityRow({ id: "visitor-1",
      project_id: "project-1", email: cipher }, "project-2")).rejects.toThrow();
    await expect(decodeFeedbackIdentityRow({ id: "visitor-2",
      project_id: "project-1", email: cipher }, "project-1")).rejects.toThrow();
    const lookup = await feedbackIdentityLookup("project-1", "email", email);
    expect(lookup).toMatch(/^[a-f0-9]{64}$/);
    expect(lookup).not.toBe(await feedbackIdentityLookup("project-2", "email", email));
    expect(lookup).not.toBe(await feedbackIdentityLookup("project-1", "external_id", email));
    expect(lookup).not.toBe(await feedbackOtpEmailLookup(email));
  });

  it("binds pending OTP email to the code row and system purpose", async () => {
    const cipher = await encodeFeedbackOtpEmail("otp-1", "private@example.test");
    expect(cipher).not.toContain("private@example.test");
    expect(await decodeFeedbackOtpEmail("otp-1", cipher)).toBe("private@example.test");
    await expect(decodeFeedbackOtpEmail("otp-2", cipher)).rejects.toThrow();
  });
});
