import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const key = Buffer.alloc(32, 43);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));
vi.mock("@/lib/server/agent/pull-request-content", () => ({
  shouldEncryptPullRequestContent: async () => true,
}));

const { decodeCodeWorkContent, decodeCodeWorkRow, encodeCodeWorkRow } =
  await import("./commit-content");

describe("commit and branch content", () => {
  it("seals a commit's title and author name, and nothing else of the row", async () => {
    const row = {
      id: "commit-1", sha: "abc", title: "Fixes MIN-42", author_name: "Camille Roy",
      author_login: "camille",
    };
    const sealed = await encodeCodeWorkRow("issue_commits", row, true);
    expect(sealed.title).toMatch(/^mdyc3:1:/);
    expect(sealed.author_name).toMatch(/^mdyc3:1:/);
    expect(sealed).toMatchObject({ sha: "abc", author_login: "camille" });
    expect(await decodeCodeWorkRow("issue_commits", sealed)).toEqual(row);
    expect(await encodeCodeWorkRow("issue_commits", row, false)).toBe(row);
  });

  it("binds a value to its table, column and row", async () => {
    const sealed = await encodeCodeWorkRow("issue_branches",
      { id: "branch-1", branch: "min-42-keyboard" }, true);
    expect(await decodeCodeWorkContent("issue_branches", "branch-1", "branch", sealed.branch))
      .toBe("min-42-keyboard");
    await expect(decodeCodeWorkContent("issue_branches", "branch-2", "branch", sealed.branch))
      .rejects.toThrow();
    await expect(decodeCodeWorkContent("issue_commits", "branch-1", "title", sealed.branch))
      .rejects.toThrow();
  });

  it("reads a value stored before encryption as it is", async () => {
    expect(await decodeCodeWorkContent("issue_commits", "commit-1", "title", "Plain title"))
      .toBe("Plain title");
    expect(await decodeCodeWorkContent("issue_commits", "commit-1", "title", null)).toBeNull();
  });
});
