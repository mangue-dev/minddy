import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const key = Buffer.alloc(32, 41);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));

const { decodePullRequestUrl, encodePullRequestUrl,
  decodePullRequestUrlRow } = await import("./pull-request-url-content");

describe("shared pull request URL storage", () => {
  it("authenticates the stable PR id across repository rename", async () => {
    const url = "https://example.invalid/private/repo/pull/11";
    const cipher = await encodePullRequestUrl("pr-1", url);
    expect(cipher).not.toContain("private/repo");
    expect(await decodePullRequestUrl("pr-1", cipher)).toBe(url);
    expect((await decodePullRequestUrlRow({ id: "pr-1", url: cipher,
      repo_full_name: "renamed/repo" })).url).toBe(url);
    await expect(decodePullRequestUrl("pr-2", cipher)).rejects.toThrow();
  });
});
