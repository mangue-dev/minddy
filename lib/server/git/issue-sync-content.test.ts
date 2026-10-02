import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const key = Buffer.alloc(32, 37);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));

const { encodeGithubIssueMetadata, decodeGithubIssueMetadata } =
  await import("./issue-sync-content");

describe("GitHub issue metadata content", () => {
  it("removes source and API plaintext and binds the issue and project", async () => {
    const value = { metadata: { issue_type: "Private issue type" },
      milestone: { title: "Private milestone" } };
    const encoded = await encodeGithubIssueMetadata("project-1", "issue-1", value);
    expect(encoded.metadata).toEqual({});
    expect(encoded.milestone).toBeNull();
    expect(JSON.stringify(encoded)).not.toContain("Private");
    const stored = { issue_id: "issue-1", ...encoded };
    const decoded = await decodeGithubIssueMetadata("project-1", stored);
    expect(decoded).toMatchObject(value);
    expect(JSON.stringify(decoded)).not.toContain("content_ciphertext");
    await expect(decodeGithubIssueMetadata("project-2", stored)).rejects.toThrow();
    await expect(decodeGithubIssueMetadata("project-1", { ...stored, issue_id: "issue-2" }))
      .rejects.toThrow();
  });
});
