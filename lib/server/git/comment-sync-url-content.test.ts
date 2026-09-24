import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const key = Buffer.alloc(32, 41);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));

const { encodeGithubCommentUrl, decodeGithubCommentUrl } =
  await import("./comment-sync-url-content");

describe("GitHub issue comment URLs", () => {
  it("keeps the forge link encrypted and authenticates its sidecar identity", async () => {
    const url = "https://github.test/private/repo/issues/1#issuecomment-2";
    const encoded = await encodeGithubCommentUrl("project-1", "issue-1", "remote-2", url);
    expect(JSON.stringify(encoded)).not.toContain("private/repo");
    const row = { issue_id: "issue-1", remote_comment_id: "remote-2", ...encoded };
    expect((await decodeGithubCommentUrl("project-1", row)).html_url).toBe(url);
    await expect(decodeGithubCommentUrl("project-2", row)).rejects.toThrow();
    await expect(decodeGithubCommentUrl("project-1", { ...row, issue_id: "issue-2" }))
      .rejects.toThrow();
    await expect(decodeGithubCommentUrl("project-1", { ...row, remote_comment_id: "remote-3" }))
      .rejects.toThrow();
  });
});
