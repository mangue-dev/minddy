import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const key = Buffer.alloc(32, 23);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));

const { encodeAgentTitle, decodeAgentTitle } = await import("./run-title-content");

describe("agent title content", () => {
  it("stores no clear title in either run or conversation and binds the project", async () => {
    const encoded = await encodeAgentTitle("project-1", "conversation-1", "Private issue summary");
    const run = { id: "run-1", project_id: "project-1",
      conversation_id: "conversation-1", ...encoded };
    const conversation = { id: "conversation-1", project_id: "project-1", ...encoded };
    expect(JSON.stringify([run, conversation])).not.toContain("Private issue summary");
    await expect(decodeAgentTitle(run)).resolves.toMatchObject({ title: "Private issue summary" });
    await expect(decodeAgentTitle(conversation)).resolves.toMatchObject({ title: "Private issue summary" });
    await expect(decodeAgentTitle({ ...run, project_id: "project-2" })).rejects.toThrow();
    await expect(decodeAgentTitle({ ...run, conversation_id: "conversation-2" })).rejects.toThrow();
  });

  it("keeps an absent title encrypted after project activation", async () => {
    const stored = await encodeAgentTitle("project-1", "conversation-1", null);
    expect(stored.title).toBeNull();
    expect(stored.title_encryption_version).toBe(1);
    await expect(decodeAgentTitle({ id: "conversation-1", project_id: "project-1",
      ...stored })).resolves.toMatchObject({ title: null });
  });
});
