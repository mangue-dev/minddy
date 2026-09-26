import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./store";

const state = vi.hoisted(() => ({
  version: 1,
  row: {} as Record<string, unknown>,
  commits: 0,
}));
const key = Buffer.alloc(32, 7);
const store = new EncryptedStore({
  current: async () => ({ version: state.version, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("./registry", () => ({
  getEncryptedStore: () => store,
  getContentKeys: () => ({
    current: async () => ({ version: state.version, bytes: Buffer.from(key) }),
  }),
}));
const query = {
  select: () => query,
  order: () => query,
  limit: async () => ({ data: [state.row], error: null }),
};
const service = {
  from: () => query,
  rpc: async (_name: string, args: Record<string, unknown>) => {
    if (args.p_previous_version !== state.row.encryption_version) {
      return { data: false, error: null };
    }
    if (args.p_content) {
      state.commits++;
      state.row = { ...state.row, payload: null,
        encrypted_content: args.p_content, encryption_version: args.p_version };
    }
    return { data: true, error: null };
  },
};
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));

const { backfillAgentEventsBatch } = await import("./agent-event-backfill");
const { decodeRunEvent } = await import("@/lib/server/agent/run-event-store");

beforeEach(() => {
  vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_AGENT_EVENT_ENCRYPTION_ENABLED", "true");
  state.version = 1;
  state.commits = 0;
  state.row = {
    id: "event-1", run_id: "run-1", seq: 0, type: "summary",
    payload: { text: "private summary" }, encrypted_content: null,
    encryption_version: 0, created_at: "2026-01-01",
    run: { project_id: "project-1" },
  };
});

describe("agent event migration", () => {
  it("converts, rotates, and skips a current event without losing its payload", async () => {
    expect(await backfillAgentEventsBatch(1)).toMatchObject({ migrated: 1, failed: 0 });
    expect(state.row.payload).toBeNull();
    expect(state.row.encrypted_content).not.toContain("private summary");
    await expect(decodeRunEvent("project-1", state.row as Parameters<typeof decodeRunEvent>[1]))
      .resolves.toMatchObject({ payload: { text: "private summary" } });
    state.version = 2;
    expect(await backfillAgentEventsBatch(1)).toMatchObject({ migrated: 1, failed: 0 });
    expect(state.row.encryption_version).toBe(2);
    expect(await backfillAgentEventsBatch(1)).toMatchObject({ unchanged: 1, failed: 0 });
    expect(state.commits).toBe(2);
    vi.unstubAllEnvs();
  });
});
