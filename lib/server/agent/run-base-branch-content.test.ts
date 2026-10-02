import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const key = Buffer.alloc(32, 47);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));

const { decodeAgentBaseBranch, decodeRuntimeBaseBranch, encodeAgentBaseBranch,
  encodeOrphanRuntimeBaseBranch } = await import("./run-base-branch-content");

describe("agent base branch storage", () => {
  it("authenticates the run and project while keeping runtime copies identical", async () => {
    const branch = "private/issue-591";
    const encoded = await encodeAgentBaseBranch("project-1", "run-1", branch);
    expect(encoded).toMatch(/^mdyb3:1:[A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain(branch);
    const row = { id: "run-1", project_id: "project-1", base_branch: encoded };
    expect((await decodeAgentBaseBranch(row)).base_branch).toBe(branch);
    expect(await decodeRuntimeBaseBranch({ conversation_id: "conversation-1",
      current_run_id: "run-1", base_branch: encoded }, "project-1")).toBe(branch);
    await expect(decodeAgentBaseBranch({ ...row, id: "run-2" })).rejects.toThrow();
    await expect(decodeAgentBaseBranch({ ...row, project_id: "project-2" }))
      .rejects.toThrow();
  });

  it("binds detached runtime values to the conversation", async () => {
    const encoded = await encodeOrphanRuntimeBaseBranch("project-1", "conversation-1",
      "private/main");
    expect(await decodeRuntimeBaseBranch({ conversation_id: "conversation-1",
      current_run_id: null, base_branch: encoded }, "project-1")).toBe("private/main");
    await expect(decodeRuntimeBaseBranch({ conversation_id: "conversation-2",
      current_run_id: null, base_branch: encoded }, "project-1")).rejects.toThrow();
  });
});
