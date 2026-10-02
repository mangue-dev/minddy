import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./store";

const state = vi.hoisted(() => ({
  version: 1,
  row: {} as Record<string, unknown>,
  commits: 0,
  prematureChecks: 0,
  rows: [] as Array<Record<string, unknown>>,
  attemptSequence: 0,
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
  limit: async (count: number) => {
    if (state.rows.length) {
      const selected = [...state.rows].sort((a, b) =>
        Number(a.attemptOrder ?? 0) - Number(b.attemptOrder ?? 0)).slice(0, count);
      state.row = selected[0];
      return { data: selected, error: null };
    }
    return { data: [state.row], error: null };
  },
};
const service = {
  from: () => query,
  rpc: async (_name: string, args: Record<string, unknown>) => {
    if (_name === "mark_agent_backfill_attempt") {
      if (args.p_id !== state.row.id ||
          (args.p_expected as Record<string, unknown>).encrypted_content !==
            state.row.encrypted_content) return { data: false, error: null };
      state.row.attemptOrder = ++state.attemptSequence;
      return { data: true, error: null };
    }
    if (args.p_previous_version !== state.row.encryption_version) {
      return { data: false, error: null };
    }
    if (args.p_content) {
      state.commits++;
      state.row = { ...state.row, payload: null,
        encrypted_content: args.p_content, encryption_version: args.p_version };
    }
    else state.prematureChecks++;
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
  state.prematureChecks = 0;
  state.rows = [];
  state.attemptSequence = 0;
  state.row = {
    id: "event-1", run_id: "run-1", seq: 0, type: "summary",
    payload: { text: "private summary" }, encrypted_content: null,
    encryption_version: 0, created_at: "2026-01-01",
    run: { project_id: "project-1" },
  };
});

it("does not attest a current-format event with a corrupt tag", async () => {
  const replacement = await (await import("@/lib/server/agent/run-event-store"))
    .encodeRunEvent("project-1", "run-1", 0, "summary", { text: "private summary" }, "event-1");
  state.row = { ...state.row, ...replacement, payload: null,
    encrypted_content: `${replacement.encrypted_content!.slice(0, -1)}A` };
  const outcome = await backfillAgentEventsBatch(1);
  expect(outcome).toMatchObject({ failed: 1, unchanged: 0 });
  expect(state.prematureChecks).toBe(0);
});

it("retries a broken first event after allowing a later event to advance", async () => {
  const replacement = await (await import("@/lib/server/agent/run-event-store"))
    .encodeRunEvent("project-1", "run-1", 0, "summary", { text: "private summary" }, "event-1");
  const broken = { ...state.row, ...replacement, payload: null,
    encrypted_content: `${replacement.encrypted_content!.slice(0, -1)}A`,
    attemptOrder: 0 };
  const healthy = { ...state.row, id: "event-2", seq: 1, attemptOrder: 0 };
  state.rows = [broken, healthy];
  expect(await backfillAgentEventsBatch(1)).toMatchObject({ failed: 1, migrated: 0 });
  expect(await backfillAgentEventsBatch(1)).toMatchObject({ failed: 0, migrated: 1 });
  expect(state.rows[0].attemptOrder).toBe(1);
  expect(state.prematureChecks).toBe(0);
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
