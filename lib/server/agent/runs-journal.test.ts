import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { encodeRunJournal } from "./run-journal-codec";

const h = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown> & { id: number }>,
  inserted: [] as Record<string, unknown>[],
  insertError: null as { code?: string; message: string } | null,
  afterId: 0,
  reads: 0,
}));

const query = {
  insert: async (row: Record<string, unknown>) => {
    h.inserted.push(row);
    return { error: h.insertError };
  },
  select: () => query,
  eq: () => query,
  gt: (_column: string, value: number) => {
    h.afterId = value;
    return query;
  },
  order: () => query,
  limit: () => query,
  maybeSingle: async () => {
    h.reads += 1;
    return {
      data: h.rows.find((row) => row.id > h.afterId) ?? null,
      error: null,
    };
  },
};
const service = { from: () => query } as unknown as SupabaseClient;

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));
vi.mock("@/lib/server/notifications", () => ({
  insertNotifications: vi.fn(),
}));
vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/server/automations/hooks", () => ({
  notifyChainOfRunEnd: vi.fn(),
}));
vi.mock("@/lib/server/routine-hooks", () => ({
  notifyRoutineOfRunEnd: vi.fn(),
  stampRoutineRunEnd: vi.fn(),
}));
vi.mock("@/lib/server/after-safe", () => ({ afterOrNow: vi.fn() }));
vi.mock("./live", () => ({ broadcastRunEvent: vi.fn() }));

const { appendRunJournal, loadRunJournal } = await import("./runs");

beforeEach(() => {
  h.rows = [];
  h.inserted = [];
  h.insertError = null;
  h.afterId = 0;
  h.reads = 0;
});

describe("agent run journal persistence", () => {
  it("stores compressed content and no JSONB event copy", async () => {
    await appendRunJournal("run-1", "session-1", [
      { aggregateID: "session-1", seq: 1, output: "x".repeat(20_000) },
    ]);

    expect(h.inserted).toHaveLength(1);
    expect(h.inserted[0]).toEqual(
      expect.objectContaining({
        run_id: "run-1",
        session_id: "session-1",
        events: null,
        payload_encoding: "gzip-json-v1",
        event_count: 1,
      }),
    );
    expect(h.inserted[0].payload).toEqual(expect.any(String));
    expect(h.inserted[0].payload_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Number(h.inserted[0].stored_bytes)).toBeLessThan(
      Number(h.inserted[0].payload_bytes),
    );
  });

  it("treats a duplicate digest as an idempotent retry", async () => {
    h.insertError = { code: "23505", message: "duplicate key" };
    await expect(
      appendRunJournal("run-1", "session-1", [{ seq: 1 }]),
    ).resolves.toBeUndefined();
  });

  it("reads compressed and legacy rows in append order", async () => {
    const encoded = encodeRunJournal([{ aggregateID: "new", seq: 2 }]);
    h.rows = [
      { id: 1, events: [{ aggregateID: "legacy", seq: 1 }] },
      {
        id: 2,
        events: null,
        payload: encoded.payload,
        payload_encoding: encoded.encoding,
        payload_sha256: encoded.sha256,
        payload_bytes: encoded.payloadBytes,
      },
    ];

    await expect(loadRunJournal("run-1", "session-1")).resolves.toEqual([
      { aggregateID: "legacy", seq: 1 },
      { aggregateID: "new", seq: 2 },
    ]);
    expect(h.reads).toBe(3);
  });

  it("abandons automatic replay before an unbounded journal is assembled", async () => {
    h.rows = [1, 2, 3].map((id) => {
      const encoded = encodeRunJournal([
        { aggregateID: "session-1", seq: id, output: "x".repeat(3_000_000) },
      ]);
      return {
        id,
        events: null,
        payload: encoded.payload,
        payload_encoding: encoded.encoding,
        payload_sha256: encoded.sha256,
        payload_bytes: encoded.payloadBytes,
      };
    });

    await expect(loadRunJournal("run-1", "session-1")).resolves.toBeNull();
    expect(h.reads).toBe(3);
  });

  it("accepts a journal containing exactly the row limit", async () => {
    h.rows = Array.from({ length: 512 }, (_, index) => ({
      id: index + 1,
      events: [{ aggregateID: "session-1", seq: index + 1 }],
    }));

    await expect(loadRunJournal("run-1", "session-1")).resolves.toHaveLength(
      512,
    );
    expect(h.reads).toBe(513);
  });
});
