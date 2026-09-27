import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore, type EncryptionScope } from "./store";

type Event = { id: string; turn_id: string; type: string;
  payload: Record<string, unknown>; attempted: number | null };
const state = vi.hoisted(() => ({
  tick: 0,
  events: [] as Event[],
  bindings: [] as Array<{ kind: string; target_id: string; run_id: string;
    turn_id: string; conversation_id: string; project_id: string }>,
}));
const key = Buffer.alloc(32, 5);
const store = new EncryptedStore({
  current: async (_scope: EncryptionScope) => ({ version: 1, bytes: Buffer.from(key) }),
  byVersion: async (_scope: EncryptionScope, version: number) => ({
    version, bytes: Buffer.from(key),
  }),
});
vi.mock("./registry", () => ({
  getEncryptedStore: () => store,
  getContentKeys: () => ({ current: async () => ({
    version: 1, bytes: Buffer.from(key),
  }) }),
}));
vi.mock("./audit", () => ({ auditDecryption: vi.fn() }));
vi.mock("./content-config", () => ({ isContentEncryptionEnabled: () => true }));

const service = {
  from(table: string) {
    let id = "";
    const filters: Record<string, string> = {};
    const query = {
      select: () => query,
      in: () => query,
      order: () => query,
      eq: (field: string, value: string) => {
        id = value; filters[field] = value; return query;
      },
      limit: async (limit: number) => ({ data: [...state.events]
        .sort((a, b) => (a.attempted === null && b.attempted !== null ? -1
          : b.attempted === null && a.attempted !== null ? 1
            : (a.attempted ?? 0) - (b.attempted ?? 0)) ||
          a.id.localeCompare(b.id))
        .slice(0, limit).map((event) => ({ ...event })), error: null }),
      maybeSingle: async () => ({ data: table === "numo_worker_legacy_bindings"
        ? state.bindings.find((binding) => binding.kind === filters.kind &&
          binding.target_id === filters.target_id) ?? null
        : table === "numo_assistant_turns"
        ? { active_run_id: "run-b", conversation_id: "conversation" }
        : table === "agent_runs"
          ? id === "run-a" ? { project_id: "project",
            parent_numo_turn_id: "turn", parent_numo_conversation_id: "conversation" }
            : id === "legacy-run" ? { project_id: "project",
              parent_numo_turn_id: null, parent_numo_conversation_id: null }
            : null
          : { project_id: "project" }, error: null }),
    };
    return query;
  },
  rpc: async (name: string, args: Record<string, unknown>) => {
    if (name === "lookup_numo_worker_legacy_binding") {
      return { data: state.bindings.find((binding) =>
        binding.kind === args.p_kind && binding.target_id === args.p_id) ?? null,
      error: null };
    }
    const event = state.events.find((candidate) => candidate.id === args.p_id)!;
    if (name === "mark_numo_worker_payload_attempt") {
      event.attempted = ++state.tick;
      return { data: true, error: null };
    }
    if (JSON.stringify(event.payload) !== JSON.stringify(args.p_old_payload)) {
      return { data: false, error: null };
    }
    if (args.p_new_payload) event.payload = args.p_new_payload as Record<string, unknown>;
    event.attempted = ++state.tick;
    return { data: true, error: null };
  },
};
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));

const { backfillNumoWorkerEventsBatch } = await import("./agent-numo-worker-backfill");
const { decodeWorkerEventPayload } = await import("@/lib/server/numo/worker-event-content");

beforeEach(() => {
  state.tick = 0;
  state.bindings = [];
  state.events = [
    { id: "a", turn_id: "turn", type: "worker_completed",
      payload: { run_id: "missing", result: "Unreadable" }, attempted: null },
    { id: "b", turn_id: "turn", type: "worker_completed",
      payload: { run_id: "run-a", result: "Private historical result" },
      attempted: null },
  ];
  vi.stubEnv("MINDDY_AGENT_RESULT_ENCRYPTION_ENABLED", "true");
});

describe("historical Numo worker events", () => {
  it("moves an orphan behind a previous run after the turn starts another run", async () => {
    expect(await backfillNumoWorkerEventsBatch(1)).toMatchObject({
      scanned: 1, failed: 1,
    });
    expect(state.events[0].attempted).not.toBeNull();
    expect(await backfillNumoWorkerEventsBatch(1)).toMatchObject({
      scanned: 1, migrated: 1, failed: 0,
    });
    expect(JSON.stringify(state.events[1].payload)).not.toContain("Private historical result");
    await expect(decodeWorkerEventPayload(state.events[1].payload, null, "b", "run-a"))
      .resolves.toEqual({ run_id: "run-a", result: "Private historical result" });
  });

  it("quarantines a pre-parent run until its immutable reviewed binding exists", async () => {
    state.events = [{ id: "legacy", turn_id: "turn", type: "worker_completed",
      payload: { result: "Pre-parent result" }, attempted: null }];
    expect(await backfillNumoWorkerEventsBatch(1)).toMatchObject({
      scanned: 1, failed: 1, migrated: 0,
    });
    expect(state.events[0].payload).toEqual({ result: "Pre-parent result" });
    state.bindings = [{ kind: "event", target_id: "legacy", run_id: "legacy-run",
      turn_id: "turn", conversation_id: "conversation", project_id: "project" }];
    expect(await backfillNumoWorkerEventsBatch(1)).toMatchObject({
      scanned: 1, migrated: 1, failed: 0,
    });
    await expect(decodeWorkerEventPayload(state.events[0].payload, null,
      "legacy", "legacy-run")).resolves.toEqual({
      result: "Pre-parent result", run_id: "legacy-run",
    });
  });
});
