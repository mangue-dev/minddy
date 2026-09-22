import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EncryptedStore, type DataKeyProvider } from "./store";

const contentKey = randomBytes(32);
const indexKey = randomBytes(32);
const provider: DataKeyProvider = {
  async current() { return { version: 1, bytes: Buffer.from(contentKey) }; },
  async byVersion() { return { version: 1, bytes: Buffer.from(contentKey) }; },
};
const store = new EncryptedStore(provider);

vi.mock("./registry", () => ({
  getEncryptedStore: () => store,
  getBlindIndexKeys: () => ({
    current: async () => ({ version: 1, bytes: Buffer.from(indexKey) }),
  }),
}));

const {
  decryptInvitationEmail,
  encryptInvitationEmail,
  invitationEmailIndex,
} = await import("./invitation-email");

const projectId = "07b14964-0def-4941-8ddf-686572d6345d";
const invitationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const audit = { actorId: "actor", reason: "invitation_list" } as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("invitation email encryption", () => {
  it("round-trips a new invitation without storing plaintext", async () => {
    const encrypted = await encryptInvitationEmail(
      " Alice@Example.Test ", projectId, invitationId,
    );
    expect(encrypted.invited_email_ciphertext).not.toContain("alice@example.test");
    expect(encrypted.encryption_version).toBe(1);
    expect(encrypted.invited_email_blind_index).toBe(
      await invitationEmailIndex("alice@example.test"),
    );
    expect(await decryptInvitationEmail({
      id: invitationId,
      project_id: projectId,
      invited_email: null,
      ...encrypted,
    }, audit)).toBe("alice@example.test");
  });

  it("rejects a moved or inconsistent encrypted row", async () => {
    const encrypted = await encryptInvitationEmail(
      "alice@example.test", projectId, invitationId,
    );
    const row = {
      id: invitationId,
      project_id: projectId,
      invited_email: null,
      ...encrypted,
    };
    await expect(decryptInvitationEmail({ ...row, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }, audit))
      .rejects.toThrow("Unable to decrypt data");
    await expect(decryptInvitationEmail({ ...row, encryption_version: 2 }, audit))
      .rejects.toThrow("Invalid invitation encryption version");
    await expect(decryptInvitationEmail({ ...row, invited_email: "alice@example.test" }, audit))
      .rejects.toThrow("Invalid invitation encryption state");
  });

  it("reads legacy plaintext only when the row says version zero", async () => {
    const legacy = {
      id: invitationId,
      project_id: projectId,
      invited_email: "alice@example.test",
      invited_email_ciphertext: null,
      invited_email_blind_index: null,
      encryption_version: 0,
    };
    expect(await decryptInvitationEmail(legacy, audit)).toBe("alice@example.test");
    await expect(decryptInvitationEmail({ ...legacy, encryption_version: 1 }, audit))
      .rejects.toThrow("Invalid invitation encryption state");
  });
});
