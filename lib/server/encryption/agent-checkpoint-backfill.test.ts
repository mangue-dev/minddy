import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./store";

type CheckpointRow = { id: string; project_id: string; conversation_id: string;
  checkpoint: Record<string, unknown> | null; checkpoint_ciphertext: string | null;
  checkpoint_encryption_version: number; checkpoint_encryption_attempted_at: number | null;
  checkpoint_encryption_checked_at: number | null };
type RuntimeRow = Omit<CheckpointRow, "id" | "project_id"> & {
  conversation: { project_id: string }; current_run_id: null };
const state = vi.hoisted(() => ({
  root: 7, tick: 0, runs: [] as CheckpointRow[], runtime: [] as RuntimeRow[],
}));
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.alloc(32, state.root) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.alloc(32, state.root) }),
});
vi.mock("./registry", () => ({
  getEncryptedStore: () => store,
  getContentKeys: () => ({ current: async () => ({
    version: 1, bytes: Buffer.alloc(32, state.root),
  }) }),
}));
vi.mock("./audit", () => ({ auditDecryption: vi.fn() }));
const service = {
  from: (table: string) => {
    const query = { select: () => query, is: () => query, order: () => query,
      limit: async (limit: number) => ({ data: (table === "agent_runs" ? state.runs : state.runtime)
        .toSorted((a, b) => (a.checkpoint_encryption_attempted_at ?? -1) -
          (b.checkpoint_encryption_attempted_at ?? -1) ||
          a.conversation_id.localeCompare(b.conversation_id)).slice(0, limit)
        .map((row) => structuredClone(row)), error: null }) };
    return query;
  },
  rpc: async (name: string, args: Record<string, unknown>) => {
    if (name === "migrate_agent_checkpoint_ciphertext") {
      const row = state.runs.find((item) => item.id === args.p_id);
      if (!row || row.checkpoint_ciphertext !== args.p_old_cipher ||
          row.checkpoint_encryption_version !== args.p_old_version) {
        return { data: false, error: null };
      }
      row.checkpoint_encryption_attempted_at = ++state.tick;
      if (args.p_cipher) {
        row.checkpoint = null;
        row.checkpoint_ciphertext = String(args.p_cipher);
        row.checkpoint_encryption_version = Number(args.p_version);
      }
      if (args.p_cipher || args.p_verified) row.checkpoint_encryption_checked_at = state.tick;
      return { data: true, error: null };
    }
    if (name === "migrate_orphan_agent_runtime_checkpoint") {
      const row = state.runtime.find((item) => item.conversation_id === args.p_conversation_id);
      if (!row || row.checkpoint_ciphertext !== args.p_old_cipher ||
          row.checkpoint_encryption_version !== args.p_old_version) {
        return { data: false, error: null };
      }
      row.checkpoint_encryption_attempted_at = ++state.tick;
      if (args.p_cipher) {
        row.checkpoint = null;
        row.checkpoint_ciphertext = String(args.p_cipher);
        row.checkpoint_encryption_version = Number(args.p_version);
      }
      if (args.p_cipher || args.p_verified) row.checkpoint_encryption_checked_at = state.tick;
      return { data: true, error: null };
    }
    return { data: null, error: { code: "unexpected_rpc" } };
  },
};
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));

const { encodeAgentCheckpoint } = await import("@/lib/server/agent/run-checkpoint-content");
const { backfillAgentCheckpointBatch } = await import("./agent-checkpoint-backfill");

beforeEach(() => {
  vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_AGENT_CHECKPOINT_ENCRYPTION_ENABLED", "true");
  state.root = 7;
  state.tick = 0;
  state.runs = [];
  state.runtime = [];
});

describe("agent checkpoint migration retries", () => {
  it("keeps a current run checkpoint unverified when the root is wrong", async () => {
    const cipher = await encodeAgentCheckpoint("project-1", "run-1",
      { messages: [{ role: "user", content: "Private" }] } as never);
    state.runs = [{ id: "run-1", project_id: "project-1", conversation_id: "conversation-1",
      ...cipher, checkpoint_encryption_attempted_at: null,
      checkpoint_encryption_checked_at: null }];
    state.root = 8;
    expect(await backfillAgentCheckpointBatch(1)).toMatchObject({ failed: 1, unchanged: 0 });
    expect(state.runs[0].checkpoint_encryption_attempted_at).not.toBeNull();
    expect(state.runs[0].checkpoint_encryption_checked_at).toBeNull();
    state.root = 7;
    expect(await backfillAgentCheckpointBatch(1)).toMatchObject({ unchanged: 1 });
    expect(state.runs[0].checkpoint_encryption_checked_at).not.toBeNull();
  });

  it("moves a failing orphan behind a clear checkpoint and verifies its migration", async () => {
    const project = "project-1";
    const cipher = await store.encrypt({ messages: ["Private first"] }, {
      scope: { kind: "project", id: project }, table: "agent_runtime_sessions",
      column: "checkpoint", rowId: "a",
    });
    state.runtime = [
      { conversation_id: "a", conversation: { project_id: project }, current_run_id: null,
        checkpoint: null, checkpoint_ciphertext: cipher, checkpoint_encryption_version: 1,
        checkpoint_encryption_attempted_at: null, checkpoint_encryption_checked_at: null },
      { conversation_id: "b", conversation: { project_id: project }, current_run_id: null,
        checkpoint: { messages: ["Private second"] }, checkpoint_ciphertext: null,
        checkpoint_encryption_version: 0, checkpoint_encryption_attempted_at: null,
        checkpoint_encryption_checked_at: null },
    ];
    state.root = 8;
    expect(await backfillAgentCheckpointBatch(1)).toMatchObject({ failed: 1 });
    expect(state.runtime[0].checkpoint_encryption_checked_at).toBeNull();
    const resumed = await backfillAgentCheckpointBatch(1);
    expect(resumed).toMatchObject({ migrated: 1, failed: 0 });
    expect(state.runtime[1].checkpoint_encryption_checked_at).not.toBeNull();
    expect(state.runtime[1].checkpoint).toBeNull();
  });
});
