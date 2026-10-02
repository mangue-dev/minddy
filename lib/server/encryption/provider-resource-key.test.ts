import { describe, expect, it, vi } from "vitest";

const first = Buffer.alloc(32, 17);
const latest = Buffer.alloc(32, 19);
vi.mock("./registry", () => ({
  getBlindIndexKeys: () => ({
    current: async () => ({ version: 2, bytes: Buffer.from(latest) }),
    byVersion: async (_scope: unknown, version: number) => {
      if (version !== 1) throw new Error("Unknown historical index key");
      return { version, bytes: Buffer.from(first) };
    },
  }),
}));

import { providerResourceIndex } from "./provider-resource-key";

describe("provider operation resource identity", () => {
  it("uses a stable purpose-separated equality digest across key rotation", async () => {
    const clear = "github:private-org/private-repo:issue-591";
    const indexed = await providerResourceIndex(clear);
    expect(indexed).toMatch(/^mdyp1:[0-9a-f]{64}$/);
    expect(indexed).not.toContain("private-repo");
    expect(await providerResourceIndex(clear)).toBe(indexed);
    expect(await providerResourceIndex(`${clear}:next`)).not.toBe(indexed);
    await expect(providerResourceIndex(indexed)).rejects.toThrow();
  });
});
