import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const key = Buffer.alloc(32, 47);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));

const { decodePrCommentEdit, encodePrCommentEdit } =
  await import("./pr-comment-edit-content");

describe("PR comment edit storage", () => {
  it("authenticates each previous comment body independently", async () => {
    const body = "Private issue-derived prior comment";
    const cipher = await encodePrCommentEdit("edit-1", body);
    expect(cipher).not.toContain(body);
    expect(await decodePrCommentEdit("edit-1", cipher)).toBe(body);
    await expect(decodePrCommentEdit("edit-2", cipher)).rejects.toThrow();
  });
});
