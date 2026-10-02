import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const key = Buffer.alloc(32, 43);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));

const { decodePullRequestContent, decodePullRequestContentRow,
  encodePullRequestContent } = await import("./pull-request-content");

describe("shared pull request content", () => {
  it("binds titles and branches separately to the stable PR identity", async () => {
    const title = "Private issue title";
    const cipher = await encodePullRequestContent("pr-1", "title", title);
    expect(cipher).not.toContain(title);
    expect(await decodePullRequestContent("pr-1", "title", cipher)).toBe(title);
    expect((await decodePullRequestContentRow({ id: "pr-1", title: cipher,
      head_branch: null, base_branch: null })).title).toBe(title);
    await expect(decodePullRequestContent("pr-2", "title", cipher)).rejects.toThrow();
    await expect(decodePullRequestContent("pr-1", "head_branch", cipher))
      .rejects.toThrow();
  });
});
