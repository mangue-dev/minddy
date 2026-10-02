import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const contentKey = Buffer.alloc(32, 47);
const indexKey = Buffer.alloc(32, 85);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(contentKey) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(contentKey) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => store,
  getBlindIndexKeys: () => ({ current: async () => ({ version: 1,
    bytes: Buffer.from(indexKey) }) }),
}));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));

const { decodeAgentWorkBranch, decodeRuntimeWorkBranch, decodeWorkBranchValue,
  encodeAgentWorkBranch, encodeOrphanArtifactBranch,
  encodeOrphanRuntimeWorkBranch, workBranchArtifactRef,
  workBranchLookupPrefix } = await import("./run-work-branch-content");

describe("agent work branch storage", () => {
  it("protects the run, runtime and artifact copy with a stable equality ref", async () => {
    const branch = "private/issue-591";
    const encoded = (await encodeAgentWorkBranch("project-1", "run-1", branch))!;
    expect(encoded).toMatch(/^mdyw3:[a-f0-9]{64}:1:[A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain(branch);
    expect(encoded.startsWith(await workBranchLookupPrefix(branch))).toBe(true);
    expect(workBranchArtifactRef(encoded)).toBe(encoded.split(":").slice(0, 2).join(":"));
    const row = { id: "run-1", project_id: "project-1", branch_name: encoded };
    expect((await decodeAgentWorkBranch(row)).branch_name).toBe(branch);
    expect(await decodeRuntimeWorkBranch({ conversation_id: "conversation-1",
      current_run_id: "run-1", work_branch: encoded }, "project-1")).toBe(branch);
    expect(await decodeWorkBranchValue("project-1", "run-1", null, encoded)).toBe(branch);
    await expect(decodeAgentWorkBranch({ ...row, id: "run-2" })).rejects.toThrow();
    await expect(decodeAgentWorkBranch({ ...row, project_id: "project-2" }))
      .rejects.toThrow();
  });

  it("keeps orphan runtime and artifact bindings independent", async () => {
    const runtime = await encodeOrphanRuntimeWorkBranch("project-1", "conversation-1",
      "private/runtime");
    expect(await decodeRuntimeWorkBranch({ conversation_id: "conversation-1",
      current_run_id: null, work_branch: runtime }, "project-1")).toBe("private/runtime");
    await expect(decodeRuntimeWorkBranch({ conversation_id: "conversation-2",
      current_run_id: null, work_branch: runtime }, "project-1")).rejects.toThrow();
    const artifact = await encodeOrphanArtifactBranch("project-1", "artifact-1",
      "private/artifact");
    expect(await decodeWorkBranchValue("project-1", null, "artifact-1", artifact))
      .toBe("private/artifact");
    await expect(decodeWorkBranchValue("project-1", null, "artifact-2", artifact))
      .rejects.toThrow();
  });
});
