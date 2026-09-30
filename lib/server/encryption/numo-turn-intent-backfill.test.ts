import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: string; user_id: string; conversation_id: string;
  request_id: string; intent: Record<string, unknown>; attempted: number | null;
  checked: number | null };
const state = vi.hoisted(() => ({ rows: [] as Row[], tick: 0 }));
vi.mock("./content-config", () => ({ isContentEncryptionEnabled: () => true }));
vi.mock("./registry", () => ({ getContentKeys: () => ({
  current: async () => ({ version: 1, bytes: Buffer.alloc(32) }),
}) }));
vi.mock("@/lib/server/numo/turn-intent-content", () => ({
  decodeNumoTurnIntent: async (intent: Record<string, unknown>) => {
    if (intent.broken) throw new Error("Undecodable intent");
    return intent.clear ?? intent;
  },
  encodeNumoTurnIntent: async (_user: string, _conversation: string,
    _request: string, clear: unknown) => ({ encrypted_intent: true, clear }),
  isEncryptedTurnIntent: (intent: Record<string, unknown>) =>
    intent.encrypted_intent === true,
  numoTurnIntentState: () => ({ version: 1, format: 3 }),
}));
const service = {
  from: () => {
    const query = {
      select: () => query,
      order: () => query,
      limit: async (limit: number) => ({ data: [...state.rows]
        .sort((a, b) => (a.attempted === null && b.attempted !== null ? -1
          : b.attempted === null && a.attempted !== null ? 1
            : (a.attempted ?? 0) - (b.attempted ?? 0)) || a.id.localeCompare(b.id))
        .slice(0, limit).map((row) => ({ ...row })), error: null }),
    };
    return query;
  },
  rpc: async (name: string, args: Record<string, unknown>) => {
    const row = state.rows.find((item) => item.id === args.p_id)!;
    if (JSON.stringify(row.intent) !== JSON.stringify(args.p_old)) {
      return { data: false, error: null };
    }
    row.attempted = ++state.tick;
    if (name === "migrate_numo_turn_intent") {
      row.intent = args.p_new as Record<string, unknown>;
      row.checked = state.tick;
    }
    return { data: true, error: null };
  },
};
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));
const { backfillNumoTurnIntentsBatch } = await import("./numo-turn-intent-backfill");

beforeEach(() => {
  vi.stubEnv("MINDDY_NUMO_TURN_INTENT_ENCRYPTION_ENABLED", "true");
  state.tick = 0;
  state.rows = [
    { id: "a", user_id: "user", conversation_id: "conversation",
      request_id: "request-a", intent: { broken: true },
      attempted: null, checked: null },
    { id: "b", user_id: "user", conversation_id: "conversation",
      request_id: "request-b", intent: { broken: true },
      attempted: null, checked: null },
    { id: "c", user_id: "user", conversation_id: "conversation",
      request_id: "request-c", intent: { title: "Private third intent" },
      attempted: null, checked: null },
  ];
});

describe("Numo intent queue", () => {
  it("advances healthy rows after a full failed batch without verifying failures", async () => {
    expect(await backfillNumoTurnIntentsBatch(2)).toMatchObject({
      scanned: 2, failed: 2, migrated: 0,
    });
    expect(state.rows[0].attempted).not.toBeNull();
    expect(state.rows[0].checked).toBeNull();
    expect(state.rows[1].checked).toBeNull();
    expect(await backfillNumoTurnIntentsBatch(2)).toMatchObject({
      scanned: 2, failed: 1, migrated: 1,
    });
    expect(state.rows[2].checked).not.toBeNull();
    expect(await backfillNumoTurnIntentsBatch(2)).toMatchObject({
      scanned: 2, failed: 1, unchanged: 1, migrated: 0,
    });
    expect(state.rows.filter((row) => row.checked === null)).toHaveLength(2);
    expect(state.rows[0].checked).toBeNull();
  });
});
