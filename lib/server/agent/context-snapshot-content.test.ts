import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const key = Buffer.alloc(32, 31);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));

const { encodeAgentContextSnapshot, decodeAgentContextSnapshot } =
  await import("./context-snapshot-content");

describe("agent context snapshots", () => {
  it("clears the projected snapshot and binds the unique context identity", async () => {
    const source = { conversation_id: "conversation-1", kind: "issue",
      resource_id: "issue-1", snapshot: { title: "Private issue title" } };
    const encoded = await encodeAgentContextSnapshot("project-1", source);
    expect(encoded.snapshot).toEqual({});
    expect(JSON.stringify(encoded)).not.toContain("Private issue title");
    await expect(decodeAgentContextSnapshot("project-1", { ...source, ...encoded }))
      .resolves.toMatchObject({ snapshot: source.snapshot });
    for (const changed of [
      { ...source, conversation_id: "conversation-2" },
      { ...source, resource_id: "issue-2" },
      { ...source, kind: "page" },
    ]) {
      await expect(decodeAgentContextSnapshot("project-1", { ...changed, ...encoded }))
        .rejects.toThrow();
    }
    await expect(decodeAgentContextSnapshot("project-2", { ...source, ...encoded }))
      .rejects.toThrow();
  });
});
