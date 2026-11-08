import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { EncryptedStore } from "@/lib/server/encryption/store";

const secret = randomBytes(32);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(secret) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(secret) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));

import {
  NumoWatchError,
  cancelNumoWatch,
  claimNumoWatch,
  createNumoWatch,
  decodeNumoWatchRow,
  encodeNumoWatchRow,
  expireNumoWatches,
  listActiveNumoWatches,
  listClockWatches,
} from "./watches";
import { NUMO_WATCH_LIMIT } from "@/lib/numo-watches";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const PROJECT = "33333333-3333-4333-8333-333333333333";
const ISSUE = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-11-08T12:00:00.000Z");

type Row = Record<string, unknown>;

/**
 * A PostgREST stand-in over one in-memory table: it applies the filters the
 * repository sends, so a missing owner or status filter shows up.
 */
function fakeService(rows: Row[]) {
  const from = (table: string) => {
    expect(table).toBe("numo_watches");
    const filters: Array<(row: Row) => boolean> = [];
    let operation: "select" | "insert" | "update" | "delete" = "select";
    let patch: Row = {};
    let count = false;
    const run = () => {
      if (operation === "insert") return [patch];
      const hit = rows.filter((row) => filters.every((filter) => filter(row)));
      if (operation === "update") for (const row of hit) Object.assign(row, patch);
      if (operation === "delete") for (const row of hit) rows.splice(rows.indexOf(row), 1);
      return hit.map((row) => ({ ...row }));
    };
    const compare = (op: (a: string, b: string) => boolean) => (column: string, value: string) => {
      filters.push((row) => typeof row[column] === "string" && op(row[column] as string, value));
      return chain;
    };
    const chain: Record<string, unknown> = {
      select: (_columns: string, options?: { count?: string }) => { count = !!options?.count; return chain; },
      insert: (row: Row) => { operation = "insert"; patch = row; rows.push({ ...row }); return chain; },
      update: (value: Row) => { operation = "update"; patch = value; return chain; },
      delete: () => { operation = "delete"; return chain; },
      eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return chain; },
      neq: (column: string, value: unknown) => { filters.push((row) => row[column] !== value); return chain; },
      in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return chain; },
      gt: compare((a, b) => Date.parse(a) > Date.parse(b)),
      lt: compare((a, b) => Date.parse(a) < Date.parse(b)),
      lte: compare((a, b) => Date.parse(a) <= Date.parse(b)),
      order: () => chain,
      limit: () => chain,
      single: async () => ({ data: run()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => void) => {
        const data = run();
        resolve(count ? { count: data.length, error: null } : { data, error: null });
      },
    };
    return chain;
  };
  return { from } as unknown as SupabaseClient;
}

const issueDone = {
  type: "issue" as const, id: ISSUE, condition: { kind: "status" as const, status: "done" as const },
};

function create(service: SupabaseClient, userId = ALICE, overrides: Partial<Parameters<typeof createNumoWatch>[2]> = {}) {
  return createNumoWatch(service, userId, {
    projectId: PROJECT, target: issueDone, action: "notify",
    instruction: "  Tell the   client  ", conversationId: null, now: NOW, ...overrides,
  });
}

describe("Numo watch codec", () => {
  it("seals the instruction under the user's key and reads it back", async () => {
    const row = await encodeNumoWatchRow({ id: "w1", user_id: ALICE, instruction: "Tell the client" },
      ALICE, { force: true });
    expect(row.instruction ?? null).toBeNull();
    expect(row.encryption_version).toBeGreaterThan(0);
    expect(JSON.stringify(row)).not.toContain("Tell the client");
    const watch = await decodeNumoWatchRow({ ...row, project_id: PROJECT }, ALICE);
    expect(watch.instruction).toBe("Tell the client");
  });

  it("refuses to decode another user's watch", async () => {
    const row = await encodeNumoWatchRow({ id: "w1", user_id: ALICE, instruction: "x" }, ALICE);
    await expect(decodeNumoWatchRow(row, BOB)).rejects.toThrow();
  });
});

describe("createNumoWatch", () => {
  it("normalizes the instruction and expires the watch after 90 days", async () => {
    const watch = await create(fakeService([]));
    expect(watch.instruction).toBe("Tell the client");
    expect(watch.status).toBe("active");
    expect(watch.expires_at).toBe("2027-02-06T12:00:00.000Z");
  });

  it("refuses a date in the past or past the expiry", async () => {
    const service = fakeService([]);
    for (const fireAt of ["2026-11-01T09:00:00Z", "2027-03-01T09:00:00Z"]) {
      await expect(create(service, ALICE, {
        target: { type: "date", id: null, condition: { kind: "date" }, fireAt },
      })).rejects.toMatchObject({ code: "invalid_date" });
    }
  });

  it("keeps a date watch a day past its time, for a clock that missed it", async () => {
    const watch = await create(fakeService([]), ALICE, {
      target: { type: "date", id: null, condition: { kind: "date" }, fireAt: "2027-02-05T09:00:00+01:00" },
    });
    expect(watch.fire_at).toBe("2027-02-05T08:00:00.000Z");
    expect(watch.expires_at).toBe("2027-02-06T12:00:00.000Z");
    const late = await create(fakeService([]), ALICE, {
      target: { type: "date", id: null, condition: { kind: "date" }, fireAt: "2027-02-06T11:00:00Z" },
    });
    expect(late.expires_at).toBe("2027-02-07T11:00:00.000Z");
  });

  it("refuses an instruction longer than a note can hold", async () => {
    await expect(create(fakeService([]), ALICE, { instruction: "x".repeat(501) }))
      .rejects.toMatchObject({ code: "invalid_instruction" });
  });

  it(`keeps at most ${NUMO_WATCH_LIMIT} active watches per user`, async () => {
    const rows: Row[] = [];
    const service = fakeService(rows);
    for (let i = 0; i < NUMO_WATCH_LIMIT; i++) await create(service);
    await expect(create(service)).rejects.toBeInstanceOf(NumoWatchError);
    // Another user's count is their own.
    await expect(create(service, BOB)).resolves.toMatchObject({ status: "active" });
    // A cancelled watch frees its place.
    await cancelNumoWatch(service, ALICE, rows[0].id as string);
    await expect(create(service)).resolves.toMatchObject({ status: "active" });
  });
});

describe("watch lifecycle", () => {
  it("fires a watch once when two clocks claim it", async () => {
    const service = fakeService([]);
    const watch = await create(service);
    const [first, second] = await Promise.all([
      claimNumoWatch(service, watch, NOW),
      claimNumoWatch(service, watch, NOW),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(await claimNumoWatch(service, watch, NOW)).toBeNull();
    expect(await listActiveNumoWatches(service, ALICE)).toEqual([]);
  });

  it("cancels only the user's own active watch", async () => {
    const service = fakeService([]);
    const watch = await create(service);
    expect(await cancelNumoWatch(service, BOB, watch.id)).toBe(false);
    expect(await cancelNumoWatch(service, ALICE, watch.id)).toBe(true);
    expect(await cancelNumoWatch(service, ALICE, watch.id)).toBe(false);
  });

  it("expires watches past their date and leaves them out of the clock", async () => {
    const rows: Row[] = [];
    const service = fakeService(rows);
    const watch = await create(service);
    const later = new Date("2027-02-07T00:00:00.000Z");
    // Still read by the clock, which evaluates it once more before expiring it.
    expect(await listClockWatches(service, null, 10)).toHaveLength(1);
    expect(await expireNumoWatches(service, later)).toBe(1);
    expect(await listClockWatches(service, null, 10)).toEqual([]);
    expect(rows.find((row) => row.id === watch.id)?.status).toBe("expired");
    expect(await claimNumoWatch(service, watch, later)).toBeNull();
  });

});
