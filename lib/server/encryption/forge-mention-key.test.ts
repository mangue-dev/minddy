import { describe, expect, it, vi } from "vitest";

const first = Buffer.alloc(32, 7);
const current = Buffer.alloc(32, 11);
vi.mock("./registry", () => ({
  getBlindIndexKeys: () => ({
    current: async () => ({ version: 2, bytes: Buffer.from(current) }),
    byVersion: async (_scope: unknown, version: number) => {
      if (version !== 1) throw new Error("Unknown index key version");
      return { version, bytes: Buffer.from(first) };
    },
  }),
}));

import { forgeMentionKeyIndex } from "./forge-mention-key";

describe("forge mention counter identities", () => {
  it("replaces private repository and login with a stable purpose-bound digest", async () => {
    const key = "mention:github:private-org/private-repo:alice";
    const indexed = await forgeMentionKeyIndex(key);
    expect(indexed).toMatch(/^mdyf1:[0-9a-f]{64}$/);
    expect(indexed).not.toContain("private-repo");
    expect(indexed).not.toContain("alice");
    expect(await forgeMentionKeyIndex(key)).toBe(indexed);
    expect(await forgeMentionKeyIndex(`${key}:other`)).not.toBe(indexed);
    await expect(forgeMentionKeyIndex(indexed)).rejects.toThrow();
  });
});
