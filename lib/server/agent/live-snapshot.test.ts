import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const state = vi.hoisted(() => ({
  version: 1,
  row: {} as Record<string, unknown>,
}));
const key = Buffer.alloc(32, 47);
const store = new EncryptedStore({
  current: async () => ({ version: state.version, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => store,
}));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));
const query = {
  select: () => query,
  eq: () => query,
  maybeSingle: async () => ({ data: state.row, error: null }),
};
const service = {
  from: () => query,
  rpc: async (_name: string, args: Record<string, unknown>) => {
    const kind = args.p_kind as "stream" | "diff";
    if (Number(args.p_at) <= Number(state.row[`${kind}_at`] ?? 0)) {
      return { data: false, error: null };
    }
    state.row[`${kind}_content`] = args.p_content;
    state.row[`${kind}_version`] = args.p_version;
    state.row[`${kind}_at`] = args.p_at;
    return { data: true, error: null };
  },
};
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));

const { saveAgentLiveSnapshot, readAgentLiveSnapshot } = await import("./live-snapshot");

beforeEach(() => {
  state.version = 1;
  state.row = { stream_content: null, stream_version: 0, stream_at: 0,
    diff_content: null, diff_version: 0, diff_at: 0 };
});

describe("protected agent live snapshots", () => {
  it("stores no clear stream or diff and reads each in the authorized project scope", async () => {
    await saveAgentLiveSnapshot({ projectId: "project-1", runId: "run-1",
      kind: "stream", payload: { text: "Private model stream" }, at: 10 });
    await saveAgentLiveSnapshot({ projectId: "project-1", runId: "run-1",
      kind: "diff", payload: { files: [{ patch: "Private local diff" }] }, at: 11 });
    expect(JSON.stringify(state.row)).not.toContain("Private");
    await expect(readAgentLiveSnapshot({ projectId: "project-1", runId: "run-1",
      actorId: "member-1" })).resolves.toEqual({
      stream: { text: "Private model stream", at: 10 },
      diff: { files: [{ patch: "Private local diff" }], at: 11 },
    });
    await expect(readAgentLiveSnapshot({ projectId: "other-project", runId: "run-1",
      actorId: "member-1" })).rejects.toThrow();
    state.version = 2;
    await saveAgentLiveSnapshot({ projectId: "project-1", runId: "run-1",
      kind: "stream", payload: { text: "Next stream" }, at: 12 });
    expect(state.row.stream_version).toBe(2);
    await expect(readAgentLiveSnapshot({ projectId: "project-1", runId: "run-1",
      actorId: "member-1" })).resolves.toMatchObject({
      stream: { text: "Next stream" },
      diff: { files: [{ patch: "Private local diff" }] },
    });
  });

  it("reports a rejected snapshot write to the caller", async () => {
    await saveAgentLiveSnapshot({ projectId: "project-1", runId: "run-1",
      kind: "stream", payload: { text: "Newer" }, at: 20 });
    await expect(saveAgentLiveSnapshot({ projectId: "project-1", runId: "run-1",
      kind: "stream", payload: { text: "Stale" }, at: 19 }))
      .rejects.toThrow("Unable to save agent live snapshot");
  });
});
