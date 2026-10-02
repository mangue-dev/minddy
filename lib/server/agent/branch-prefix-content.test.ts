import { describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { EncryptedStore } from "@/lib/server/encryption/store";

const keys = new Map([[1,randomBytes(32)],[2,randomBytes(32)]]);
const store = new EncryptedStore({
  current: async () => ({version:2,bytes:Buffer.from(keys.get(2)!)}),
  byVersion: async (_scope,version) => ({version,
    bytes:Buffer.from(keys.get(version)!)}),
});
vi.mock("@/lib/server/encryption/registry",()=>({getEncryptedStore:()=>store}));

const { encodeAgentBranchPrefix, decodeAgentBranchPrefix,
  agentBranchPrefixVersion } = await import("./branch-prefix-content");

describe("personal agent branch namespace", () => {
  it("seals the source and restores only for its owner", async () => {
    const user = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";
    const cipher = await encodeAgentBranchPrefix(user,"private/team/");
    expect(cipher).toMatch(/^mdye3:/);
    expect(cipher).not.toContain("private/team/");
    expect(agentBranchPrefixVersion(cipher)).toBe(2);
    expect(await decodeAgentBranchPrefix(user,cipher)).toBe("private/team/");
    await expect(decodeAgentBranchPrefix("other-user",cipher)).rejects.toThrow();
    expect(await decodeAgentBranchPrefix(user,"legacy/")).toBe("legacy/");
    await expect(encodeAgentBranchPrefix(user,"bad..prefix/"))
      .rejects.toThrow();
  });
});
