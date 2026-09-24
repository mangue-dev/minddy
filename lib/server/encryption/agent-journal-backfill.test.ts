import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./store";
import { encodeRunJournal } from "@/lib/server/agent/run-journal-codec";

const state = vi.hoisted(() => ({
  version: 1,
  row: {} as Record<string, unknown>,
  commits: 0,
  collision: false,
}));
const content = Buffer.alloc(32, 7);
const index = Buffer.alloc(32, 9);
const store = new EncryptedStore({
  current: async () => ({ version: state.version, bytes: Buffer.from(content) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(content) }),
});
const keys = {
  current: async () => ({ version: state.version, bytes: Buffer.from(content) }),
};
vi.mock("./registry", () => ({
  getEncryptedStore: () => store,
  getContentKeys: () => keys,
  getBlindIndexKeys: () => ({
    current: async () => ({ version: 1, bytes: Buffer.from(index) }),
  }),
}));
const query = {
  select: () => query,
  order: () => query,
  limit: async () => ({ data: [state.row], error: null }),
  eq: () => query,
  neq: () => query,
  maybeSingle: async () => ({
    data: state.collision ? { id: 1 } : null, error: null,
  }),
};
const service = {
  from: () => query,
  rpc: async (_name: string, args: Record<string, unknown>) => {
    if (args.p_previous_version !== state.row.encryption_version) {
      return { data: false, error: null };
    }
    if (args.p_payload) {
      state.commits++;
      state.row = {
        ...state.row,
        events: null,
        payload: args.p_payload,
        payload_sha256: args.p_digest,
        payload_encoding: "encrypted-gzip-json-v1",
        encryption_version: args.p_version,
        event_count: args.p_event_count,
        payload_bytes: args.p_payload_bytes,
        stored_bytes: args.p_stored_bytes,
      };
    }
    return { data: true, error: null };
  },
};
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));

const { backfillAgentJournalBatch } = await import("./agent-journal-backfill");
const { decodeJournal } = await import("@/lib/server/agent/encrypted-journal");

beforeEach(() => {
  vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_AGENT_JOURNAL_ENCRYPTION_ENABLED", "true");
  state.version = 1;
  state.commits = 0;
  state.collision = false;
  const legacy = encodeRunJournal([{ seq: 1, output: "private tool output" }]);
  state.row = {
    id: 1, run_id: "run-1", session_id: "session-1", run: { project_id: "project-1" },
    events: null, payload: legacy.payload, payload_encoding: legacy.encoding,
    payload_sha256: legacy.sha256, event_count: legacy.eventCount,
    payload_bytes: legacy.payloadBytes, stored_bytes: legacy.storedBytes,
    encryption_version: 0,
  };
});

describe("agent journal migration", () => {
  it("converts legacy content, rotates it, and skips an already current envelope", async () => {
    expect(await backfillAgentJournalBatch(1)).toMatchObject({ migrated: 1, failed: 0 });
    expect(state.row.events).toBeNull();
    expect(state.row.payload_encoding).toBe("encrypted-gzip-json-v1");
    expect(state.row.payload).not.toContain("private tool output");
    await expect(decodeJournal("project-1", state.row as unknown as Parameters<typeof decodeJournal>[1]))
      .resolves.toMatchObject({ events: [{ seq: 1, output: "private tool output" }] });
    state.version = 2;
    expect(await backfillAgentJournalBatch(1)).toMatchObject({ migrated: 1, failed: 0 });
    expect(state.row.encryption_version).toBe(2);
    expect(await backfillAgentJournalBatch(1)).toMatchObject({ unchanged: 1, failed: 0 });
    expect(state.commits).toBe(2);
    vi.unstubAllEnvs();
  });

  it("preserves identical legacy JSON batches as separate replay rows", async () => {
    state.row = {
      id: 1, run_id: "run-1", session_id: "session-1",
      run: { project_id: "project-1" },
      events: [{ seq: 1, output: "private" }],
      payload: null, payload_sha256: null, payload_encoding: null,
      encryption_version: 0,
    };
    expect(await backfillAgentJournalBatch(1)).toMatchObject({ migrated: 1 });
    const firstDigest = state.row.payload_sha256;
    state.row = {
      ...state.row, id: 2, events: [{ seq: 1, output: "private" }],
      payload: null, payload_sha256: null, payload_encoding: null,
      encryption_version: 0,
    };
    state.collision = true;
    expect(await backfillAgentJournalBatch(1)).toMatchObject({ migrated: 1 });
    expect(state.row.payload_sha256).not.toBe(firstDigest);
    await expect(decodeJournal("project-1",
      state.row as unknown as Parameters<typeof decodeJournal>[1]))
      .resolves.toMatchObject({ events: [{ seq: 1, output: "private" }] });
    vi.unstubAllEnvs();
  });
});
