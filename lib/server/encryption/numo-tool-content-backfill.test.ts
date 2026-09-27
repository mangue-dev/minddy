import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./store";

const state = vi.hoisted(() => ({
  version: 1,
  turns: [] as Array<{ id: string; user_id: string; checkpoint: Record<string, unknown> }>,
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  attempted: [] as string[],
}));
const key = Buffer.alloc(32, 23);
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
vi.mock("./audit", () => ({ auditDecryption: vi.fn() }));
const service = {
  from: (table: string) => {
    const query = {
      select: () => query,
      or: () => query,
      order: () => query,
      limit: async (limit: number) => ({ data: table === "numo_assistant_turns"
        ? [...state.turns].sort((a, b) =>
          Number(state.attempted.includes(a.id)) - Number(state.attempted.includes(b.id)))
          .slice(0, limit) : [], error: null }),
    };
    return query;
  },
  rpc: async (name: string, args: Record<string, unknown>) => {
    state.calls.push({ name, args });
    if (name === "mark_numo_content_attempt") {
      state.attempted.push(String(args.p_id));
      return { data: null, error: null };
    }
    if (name !== "migrate_numo_tool_checkpoint") return { data: false, error: null };
    const turn = state.turns.find((row) => row.id === args.p_id);
    if (!turn || JSON.stringify(turn.checkpoint) !== JSON.stringify(args.p_old)) {
      return { data: false, error: null };
    }
    turn.checkpoint = args.p_new as Record<string, unknown>;
    return { data: true, error: null };
  },
};
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));

const { backfillNumoToolContentBatch } = await import("./numo-tool-content-backfill");
const { decodeNumoCheckpoint } = await import("@/lib/server/numo/tool-content");

beforeEach(() => {
  vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_NUMO_TOOL_CONTENT_ENCRYPTION_ENABLED", "true");
  state.version = 1;
  state.calls = [];
  state.attempted = [];
  state.turns = [
    { id: "turn-model", user_id: "user-1", checkpoint: { phase: "model", messages: ["Private model"] } },
    { id: "turn-tools", user_id: "user-1", checkpoint: { phase: "tools", assistantMessageId: "message-1", toolCalls: ["Private tool"] } },
    { id: "turn-done", user_id: "user-1", checkpoint: { phase: "done" } },
  ];
});

describe("Numo tool checkpoint worker", () => {
  it("converts model and tools, retains done, and rotates historical keys", async () => {
    expect(await backfillNumoToolContentBatch(3)).toMatchObject({
      scanned: 3, migrated: 2, unchanged: 1, failed: 0,
    });
    expect(state.calls.map((call) => call.name)).toEqual([
      "migrate_numo_tool_checkpoint", "migrate_numo_tool_checkpoint",
      "migrate_numo_tool_checkpoint",
    ]);
    for (const turn of state.turns.slice(0, 2)) {
      expect(JSON.stringify(turn.checkpoint)).not.toContain("Private");
      expect((await decodeNumoCheckpoint(turn.user_id, turn.id, turn.checkpoint)).phase)
        .toBe(turn.id === "turn-model" ? "model" : "tools");
    }
    state.version = 2;
    expect(await backfillNumoToolContentBatch(3)).toMatchObject({
      scanned: 3, migrated: 2, unchanged: 1, failed: 0,
    });
    expect(state.turns[0].checkpoint.encryption_version).toBe(2);
    expect(state.turns[1].checkpoint.encryption_version).toBe(2);
  });

  it("moves a failed checkpoint behind later candidates", async () => {
    state.turns = [
      { id: "bad", user_id: "user-1", checkpoint: { phase: "unknown", text: "Private" } },
      { id: "bad-2", user_id: "user-1", checkpoint: { phase: "unknown", text: "Private" } },
      { id: "good", user_id: "user-1", checkpoint: { phase: "done" } },
    ];
    expect(await backfillNumoToolContentBatch(2)).toMatchObject({
      scanned: 2, failed: 2, unchanged: 0,
    });
    expect(state.attempted).toEqual(["bad", "bad-2"]);
    expect(await backfillNumoToolContentBatch(2)).toMatchObject({
      scanned: 2, failed: 1, unchanged: 1,
    });
  });
});
