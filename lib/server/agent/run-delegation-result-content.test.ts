import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const key = Buffer.alloc(32, 29);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));

const { decodeDelegationResult, encodeDelegationResult } = await import(
  "./run-delegation-result-content");
const { decodeWorkerEventPayload } = await import("@/lib/server/numo/worker-event-content");

const result = { version: 1 as const, status: "completed" as const,
  summary: "Private agent summary", changedFiles: [], verificationPerformed: [],
  artifacts: [{ kind: "branch" as const, ref: "private/issue-591" }],
  unresolvedDecisions: [] };

describe("delegation result storage", () => {
  it("binds the result to its project and run", async () => {
    const stored = await encodeDelegationResult("project-1", "run-1", result);
    expect(JSON.stringify(stored)).not.toContain(result.summary);
    expect(JSON.stringify(stored)).not.toContain(result.artifacts[0].ref);
    const row = { id: "run-1", project_id: "project-1", ...stored };
    expect((await decodeDelegationResult(row)).delegation_result).toEqual(result);
    await expect(decodeDelegationResult({ ...row, id: "run-2" })).rejects.toThrow();
    await expect(decodeDelegationResult({ ...row, project_id: "project-2" }))
      .rejects.toThrow();
  });

  it("authenticates the Numo event copy against its event and run", async () => {
    const payload = { run_id: "run-1", status: "completed", result };
    const cipher = await store.encrypt(payload, { scope: { kind: "project", id: "project-1" },
      table: "numo_turn_events", column: "payload", rowId: "event-1" });
    const wrapper = { encrypted_worker_payload: cipher,
      encryption_version: store.versionOf(cipher), project_id: "project-1",
      event_id: "event-1", run_id: "run-1" };
    expect(JSON.stringify(wrapper)).not.toContain(result.summary);
    expect(await decodeWorkerEventPayload(wrapper, null, "event-1", "run-1"))
      .toEqual(payload);
    await expect(decodeWorkerEventPayload({ ...wrapper, event_id: "event-2" },
      null, "event-1", "run-1")).rejects.toThrow();
    await expect(decodeWorkerEventPayload({ ...wrapper, run_id: "run-2" },
      null, "event-1", "run-1")).rejects.toThrow();
  });
});
