import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The wake (MIN-929) against an in-memory database: it admits one ordinary
 * Numo turn in a background conversation of its own, once per batch, within
 * the daily cap, and never while background Numo or its memory is off. The
 * turn runs later, in the wake-turn drain, which stops it instead when the
 * switch went off in between.
 */

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  metadata: {} as Record<string, unknown>,
  limit: null as string | null,
  startNumoIntent: null as unknown as ReturnType<typeof vi.fn<(...args: any[]) => any>>,
  loadWakeInput: null as unknown as ReturnType<typeof vi.fn<(...args: any[]) => any>>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/app-config", () => ({ getAppConfigValue: async () => state.limit }));
vi.mock("./conversation-title-content", () => ({
  shouldProtectConversationTitle: async () => false,
  encodeConversationTitle: async () => "sealed",
}));
const turns = vi.hoisted(() => ({ execute: vi.fn(), stop: vi.fn() }));
vi.mock("./turns", () => ({ executeNumoTurn: turns.execute, requestNumoRequestStop: turns.stop }));
vi.mock("./start-intent", () => ({ startNumoIntent: (...args: unknown[]) => state.startNumoIntent(...args) }));
vi.mock("./wake-context", () => ({ loadWakeInput: (...args: unknown[]) => state.loadWakeInput(...args) }));

/** Just enough of PostgREST for the wake's queries. */
function table(name: string) {
  const rows = () => (state.tables[name] ??= []);
  const filters: Array<(row: Row) => boolean> = [];
  let head = false;
  let action: "select" | "delete" | "update" = "select";
  let patch: Row = {};
  const matching = () => rows().filter((row) => filters.every((f) => f(row)));
  const chain = {
    select: (_columns?: string, options?: { head?: boolean }) => { head = !!options?.head; return chain; },
    eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return chain; },
    in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return chain; },
    gte: (column: string, value: string) => { filters.push((row) => String(row[column]) >= value); return chain; },
    lte: () => chain,
    not: (column: string) => { filters.push((row) => row[column] != null); return chain; },
    order: () => chain,
    limit: () => chain,
    insert: async (row: Row) => {
      if (name === "numo_wakes" && rows().some((r) => r.batch_id === row.batch_id)) {
        return { error: { code: "23505", message: "duplicate" } };
      }
      rows().push({ created_at: new Date().toISOString(), ...row });
      return { error: null };
    },
    delete: () => { action = "delete"; return chain; },
    update: (values: Row) => { action = "update"; patch = values; return chain; },
    maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => void) => {
      const found = matching();
      if (action === "delete") state.tables[name] = rows().filter((row) => !found.includes(row));
      if (action === "update") for (const row of found) Object.assign(row, patch);
      return resolve(head ? { count: found.length, error: null } : { data: found, error: null });
    },
  };
  return chain;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: table,
    auth: { admin: { getUserById: async () => ({ data: { user: { user_metadata: state.metadata } }, error: null }) } },
  }),
}));

import { drainNumoWakeTurns, wakeNumo } from "./wake";

const USER = "11111111-1111-4111-8111-111111111111";
const request = {
  batchId: "44444444-4444-4444-8444-444444444444",
  userId: USER,
  eventIds: [7],
  reason: "memory_instruction" as const,
  sentence: "The user asked you to watch for events like these.",
  engine: "model" as const,
};

const event = {
  id: 7,
  type: "issue.created",
  project: "MIN",
  object: { kind: "issue", reference: "MIN-42", title: "Compare the three CRM vendors" },
  actor: "Sam Lee",
  relations: [],
  signals: [],
  at: "2026-11-08T10:00:00.000Z",
};

beforeEach(() => {
  state.tables = {
    routine_events: [{ id: 7, project_id: "project-1", subject_type: "issue", subject_id: "issue-42" }],
  };
  state.metadata = { numo_background: true, locale: "fr" };
  state.limit = null;
  state.loadWakeInput = vi.fn(async () => ({ events: [event], memories: [], journal: [] }));
  let turn = 0;
  state.startNumoIntent = vi.fn(async (input: { conversationId: string }) => ({
    conversationId: input.conversationId, turnId: `turn-${++turn}`,
  }));
});

describe("wakeNumo", () => {
  it("admits one background turn with the kept events, in the user's language", async () => {
    await expect(wakeNumo(request)).resolves.toBe("started");
    const input = state.startNumoIntent.mock.calls[0][0];
    expect(input).toMatchObject({
      userId: USER,
      projectId: null,
      locale: "fr",
      timezone: "UTC",
      source: "background",
      wake: { batchId: request.batchId },
      executeInBackground: false,
    });
    expect(input.prompt).toContain("The user asked you to watch for events like these.");
    expect(input.prompt).toContain("2026-11-08T10:00:00.000Z: issue.created on issue MIN-42 \"Compare the three CRM vendors\"");
    expect(input.prompt).toContain("project_id: project-1; issue_id: issue-42");
    // Admitted only: the turn runs in the Numo turns clock.
    expect(turns.execute).not.toHaveBeenCalled();
    expect(state.tables.numo_wakes).toEqual([expect.objectContaining({
      batch_id: request.batchId, turn_id: "turn-1", conversation_id: input.conversationId,
    })]);
    expect(state.tables.conversations).toEqual([expect.objectContaining({ id: input.conversationId, user_id: USER })]);
  });

  it("gives every wake a conversation of its own", async () => {
    await wakeNumo(request);
    await wakeNumo({ ...request, batchId: "55555555-5555-4555-8555-555555555555" });
    const [first, second] = state.startNumoIntent.mock.calls.map((call) => call[0].conversationId);
    expect(second).not.toBe(first);
    expect(state.tables.conversations).toHaveLength(2);
  });

  it("wakes Numo once per batch", async () => {
    await wakeNumo(request);
    await expect(wakeNumo(request)).resolves.toBe("duplicate");
    expect(state.startNumoIntent).toHaveBeenCalledTimes(1);
  });

  it("stays asleep while background Numo or its memory is off", async () => {
    state.metadata = { numo_background: false };
    await expect(wakeNumo(request)).resolves.toBe("switched_off");
    state.metadata = { numo_background: true, numo_memory: false };
    await expect(wakeNumo(request)).resolves.toBe("switched_off");
    expect(state.startNumoIntent).not.toHaveBeenCalled();
  });

  it("stops at the daily cap the admin set", async () => {
    state.limit = "1";
    await wakeNumo(request);
    await expect(wakeNumo({ ...request, batchId: "55555555-5555-4555-8555-555555555555" }))
      .resolves.toBe("capped");
    state.limit = "0";
    state.tables.numo_wakes = [];
    await expect(wakeNumo({ ...request, batchId: "66666666-6666-4666-8666-666666666666" }))
      .resolves.toBe("capped");
    expect(state.startNumoIntent).toHaveBeenCalledTimes(1);
  });

  it("undoes a wake whose turn could not start: no count, no empty conversation", async () => {
    state.startNumoIntent = vi.fn(async () => { throw new Error("usage_budget_exceeded"); });
    await expect(wakeNumo(request)).rejects.toThrow("usage_budget_exceeded");
    expect(state.tables.numo_wakes).toEqual([]);
    expect(state.tables.conversations).toEqual([]);
  });

  it("has nothing to do when no kept event is still the user's to see", async () => {
    state.loadWakeInput = vi.fn(async () => ({ events: [], memories: [], journal: [] }));
    await expect(wakeNumo(request)).resolves.toBe("empty");
    expect(state.startNumoIntent).not.toHaveBeenCalled();
  });
});

describe("drainNumoWakeTurns", () => {
  beforeEach(() => {
    state.tables.numo_wakes = [{ id: "w-1", turn_id: "turn-9", user_id: USER, created_at: new Date().toISOString() }];
    state.tables.numo_assistant_turns = [{
      id: "turn-9", status: "queued", user_id: USER, conversation_id: "c-9", request_id: "r-9",
    }];
    turns.execute.mockResolvedValue({ status: "completed" });
  });

  it("runs the waiting wake turns", async () => {
    await expect(drainNumoWakeTurns()).resolves.toEqual({ ran: 1 });
    expect(turns.execute).toHaveBeenCalledWith(expect.objectContaining({ turnId: "turn-9" }));
  });

  it("stops a wake turn whose user switched background Numo off since it was admitted", async () => {
    state.metadata = { numo_background: false };
    await expect(drainNumoWakeTurns()).resolves.toEqual({ ran: 0 });
    expect(turns.execute).not.toHaveBeenCalled();
    expect(turns.stop).toHaveBeenCalledWith({ conversationId: "c-9", userId: USER, requestId: "r-9" });
  });
});
