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
  advanceRecurringNumoWatch,
  cancelNumoWatch,
  claimNumoWatch,
  claimStrandedNumoWatches,
  createNumoWatch,
  decodeNumoWatchRow,
  encodeNumoWatchRow,
  expireNumoWatches,
  listClockWatches,
  listOpenNumoWatches,
  numoWatchOccurrenceRequestId,
  pauseNumoWatch,
  purgeFinishedNumoWatches,
  recentActedNumoWatchRequestIds,
  recordNumoWatchOccurrence,
  resumeNumoWatch,
  updateNumoWatch,
} from "./watches";
import {
  NUMO_RECURRING_FAILURE_LIMIT,
  NUMO_RECURRING_WATCH_LIMIT,
  NUMO_WATCH_LIMIT,
} from "@/lib/numo-watches";

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
      // The columns the table defaults.
      insert: (row: Row) => {
        operation = "insert";
        patch = { grants: [], consecutive_failures: 0, outcome: null, fired_at: null, ...row };
        rows.push({ ...patch });
        return chain;
      },
      update: (value: Row) => { operation = "update"; patch = value; return chain; },
      delete: () => { operation = "delete"; return chain; },
      eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return chain; },
      neq: (column: string, value: unknown) => { filters.push((row) => row[column] !== value); return chain; },
      in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return chain; },
      is: (column: string, value: unknown) => { filters.push((row) => (row[column] ?? null) === value); return chain; },
      not: (column: string, _operator: string, value: unknown) => {
        filters.push((row) => (row[column] ?? null) !== value);
        return chain;
      },
      gt: compare((a, b) => Date.parse(a) > Date.parse(b)),
      gte: compare((a, b) => Date.parse(a) >= Date.parse(b)),
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
    expect(await listOpenNumoWatches(service, ALICE)).toEqual([]);
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

const DATE = { type: "date" as const, id: null, condition: { kind: "date" as const }, fireAt: "" };
const EVENING = { kind: "daily" as const, time: "19:00" };

/** A recurring reminder: every evening at 19:00 in Paris. `NOW` is 13:00 there. */
function recurring(service: SupabaseClient, userId = ALICE, overrides: Partial<Parameters<typeof createNumoWatch>[2]> = {}) {
  return create(service, userId, {
    target: DATE, action: "act", recurrence: EVENING, timezone: "Europe/Paris",
    instruction: "Review my issues", ...overrides,
  });
}

const clockView = async (service: SupabaseClient, id: string) =>
  (await listClockWatches(service, null, 50)).find((watch) => watch.id === id)!;

describe("recurring reminders (MIN-953)", () => {
  it("starts at the next occurrence on the user's clock and never expires", async () => {
    const rows: Row[] = [];
    const service = fakeService(rows);
    const watch = await recurring(service, ALICE, { grants: ["administration", "notification"] });
    expect(watch).toMatchObject({
      status: "active", fire_at: "2026-11-08T18:00:00.000Z", recurrence: EVENING,
      grants: ["notification", "administration"], consecutive_failures: 0,
    });
    expect(await expireNumoWatches(service, new Date("2030-01-01T00:00:00Z"))).toBe(0);
    expect(rows[0].status).toBe("active");
  });

  it("only recurs as a date reminder that acts, with a time zone, and only then carries grants", async () => {
    const service = fakeService([]);
    await expect(recurring(service, ALICE, { action: "notify" })).rejects.toMatchObject({ code: "invalid_recurrence" });
    await expect(recurring(service, ALICE, { target: issueDone })).rejects.toMatchObject({ code: "invalid_recurrence" });
    await expect(recurring(service, ALICE, { timezone: null })).rejects.toMatchObject({ code: "invalid_recurrence" });
    await expect(recurring(service, ALICE, { recurrence: { kind: "hourly", time: "09:00" } }))
      .rejects.toMatchObject({ code: "invalid_recurrence" });
    await expect(recurring(service, ALICE, { grants: ["root"] })).rejects.toMatchObject({ code: "invalid_grants" });
    await expect(create(service, ALICE, { grants: ["notification"] })).rejects.toMatchObject({ code: "invalid_grants" });
  });

  it(`keeps at most ${NUMO_RECURRING_WATCH_LIMIT} active recurring reminders, a paused one aside`, async () => {
    const rows: Row[] = [];
    const service = fakeService(rows);
    for (let i = 0; i < NUMO_RECURRING_WATCH_LIMIT; i++) await recurring(service);
    await expect(recurring(service)).rejects.toMatchObject({ code: "recurring_limit_reached" });
    expect(rows).toHaveLength(NUMO_RECURRING_WATCH_LIMIT);
    // A one-off reminder still fits, and so does another user's recurring one.
    await expect(create(service)).resolves.toMatchObject({ status: "active" });
    await expect(recurring(service, BOB)).resolves.toMatchObject({ status: "active" });
    // Pausing one frees a place; resuming it then is refused while the place is taken.
    const first = rows[0].id as string;
    expect(await pauseNumoWatch(service, ALICE, first)).toBe(true);
    await expect(recurring(service)).resolves.toMatchObject({ status: "active" });
    await expect(resumeNumoWatch(service, ALICE, first, NOW)).rejects.toMatchObject({ code: "recurring_limit_reached" });
    expect(rows.find((row) => row.id === first)?.status).toBe("paused");
  });

  it("claims an occurrence once for two clocks, and leaves the reminder active at its next one", async () => {
    const rows: Row[] = [];
    const service = fakeService(rows);
    const watch = await recurring(service);
    const due = new Date("2026-11-08T18:02:00.000Z");
    const seen = await clockView(service, watch.id);
    const claims = await Promise.all([
      advanceRecurringNumoWatch(service, seen, { fire: true, now: due }),
      advanceRecurringNumoWatch(service, seen, { fire: true, now: due }),
    ]);
    const won = claims.filter(Boolean);
    expect(won).toHaveLength(1);
    expect(won[0]).toMatchObject({
      status: "active", fire_at: "2026-11-09T18:00:00.000Z", fired_at: due.toISOString(), outcome: null,
    });
    // The same stale view cannot claim it again; a fresh one waits for tomorrow.
    expect(await advanceRecurringNumoWatch(service, seen, { fire: true, now: due })).toBeNull();
    expect((await clockView(service, watch.id)).fire_at).toBe("2026-11-09T18:00:00.000Z");
  });

  it("moves a missed occurrence on without marking it fired", async () => {
    const rows: Row[] = [];
    const service = fakeService(rows);
    const watch = await recurring(service);
    const late = new Date("2026-11-09T09:00:00.000Z");
    const skipped = await advanceRecurringNumoWatch(service, await clockView(service, watch.id), { fire: false, now: late });
    expect(skipped).toMatchObject({ fire_at: "2026-11-09T18:00:00.000Z", fired_at: null });
  });

  it(`pauses after ${NUMO_RECURRING_FAILURE_LIMIT} occurrences in a row that fail, and a finished one clears the count`, async () => {
    const rows: Row[] = [];
    const service = fakeService(rows);
    const watch = await recurring(service);
    const row = () => rows.find((candidate) => candidate.id === watch.id)!;
    const occurrence = async (day: number) => {
      const now = new Date(`2026-11-${String(day).padStart(2, "0")}T18:01:00.000Z`);
      const claimed = await advanceRecurringNumoWatch(service, await clockView(service, watch.id), { fire: true, now });
      return { id: watch.id, firedAt: claimed!.fired_at! };
    };
    expect(await recordNumoWatchOccurrence(service, await occurrence(8), { outcome: "failed", failed: true }))
      .toEqual({ paused: false });
    expect(await recordNumoWatchOccurrence(service, await occurrence(9), { outcome: "failed", failed: true }))
      .toEqual({ paused: false });
    expect(row().consecutive_failures).toBe(2);
    // One that finishes starts the count again.
    expect(await recordNumoWatchOccurrence(service, await occurrence(10), { finished: true })).toEqual({ paused: false });
    expect(row().consecutive_failures).toBe(0);
    for (const day of [11, 12]) {
      await recordNumoWatchOccurrence(service, await occurrence(day), { outcome: "failed", failed: true });
    }
    const third = await occurrence(13);
    expect(await recordNumoWatchOccurrence(service, third, { outcome: "budget_fallback", failed: true }))
      .toEqual({ paused: true });
    expect(row()).toMatchObject({ status: "paused", outcome: "budget_fallback", consecutive_failures: 3 });
    // Paused: the clock no longer reads it.
    expect(await listClockWatches(service, null, 50)).toEqual([]);
    expect((await listOpenNumoWatches(service, ALICE)).map((item) => item.status)).toEqual(["paused"]);
  });

  it("records an outcome on the occurrence it names only", async () => {
    const rows: Row[] = [];
    const service = fakeService(rows);
    const watch = await recurring(service);
    const first = await advanceRecurringNumoWatch(service, await clockView(service, watch.id),
      { fire: true, now: new Date("2026-11-08T18:01:00.000Z") });
    await advanceRecurringNumoWatch(service, await clockView(service, watch.id),
      { fire: true, now: new Date("2026-11-09T18:01:00.000Z") });
    // Yesterday's turn fails after today's occurrence was claimed.
    expect(await recordNumoWatchOccurrence(service, { id: watch.id, firedAt: first!.fired_at! },
      { outcome: "failed", failed: true })).toEqual({ paused: false });
    expect(rows[0]).toMatchObject({ outcome: null, consecutive_failures: 0 });
  });

  it("resumes at the next occurrence with a clean count, and cancels a paused reminder", async () => {
    const rows: Row[] = [];
    const service = fakeService(rows);
    const watch = await recurring(service);
    rows[0].consecutive_failures = 3;
    expect(await pauseNumoWatch(service, BOB, watch.id)).toBe(false);
    expect(await pauseNumoWatch(service, ALICE, watch.id)).toBe(true);
    expect(await resumeNumoWatch(service, BOB, watch.id)).toBeNull();
    const resumed = await resumeNumoWatch(service, ALICE, watch.id, new Date("2026-12-01T20:00:00.000Z"));
    expect(resumed).toMatchObject({ status: "active", fire_at: "2026-12-02T18:00:00.000Z", consecutive_failures: 0 });
    // A one-off reminder is never paused.
    const once = await create(service);
    expect(await pauseNumoWatch(service, ALICE, once.id)).toBe(false);
    await pauseNumoWatch(service, ALICE, watch.id);
    expect(await cancelNumoWatch(service, ALICE, watch.id)).toBe(true);
  });

  it("changes the instruction or the cadence, keeps the grants, and moves the next occurrence", async () => {
    const rows: Row[] = [];
    const service = fakeService(rows);
    const watch = await recurring(service, ALICE, { grants: ["notification"] });
    const reworded = await updateNumoWatch(service, ALICE, watch.id, { instruction: " Prepare  tomorrow ", now: NOW });
    expect(reworded).toMatchObject({ instruction: "Prepare tomorrow", fire_at: watch.fire_at, grants: ["notification"] });
    const moved = await updateNumoWatch(service, ALICE, watch.id,
      { recurrence: { kind: "weekly", time: "09:00", weekday: 1 }, now: NOW });
    expect(moved).toMatchObject({
      instruction: "Prepare tomorrow", recurrence: { kind: "weekly", time: "09:00", weekday: 1 },
      fire_at: "2026-11-09T08:00:00.000Z",
    });
    expect(await updateNumoWatch(service, BOB, watch.id, { instruction: "x" })).toBeNull();
    await expect(updateNumoWatch(service, ALICE, watch.id, { instruction: "x".repeat(501) }))
      .rejects.toMatchObject({ code: "invalid_instruction" });
    // A one-off reminder is replaced, not updated.
    expect(await updateNumoWatch(service, ALICE, (await create(service)).id, { instruction: "x" })).toBeNull();
  });

  it("gives each occurrence its own turn request id, found by the reminders lane", async () => {
    const rows: Row[] = [];
    const service = fakeService(rows);
    const watch = await recurring(service);
    const now = new Date("2026-11-08T18:01:00.000Z");
    const claimed = await advanceRecurringNumoWatch(service, await clockView(service, watch.id), { fire: true, now });
    const requestId = numoWatchOccurrenceRequestId(watch.id, claimed!.fired_at!);
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    // The same instant written with an offset names the same occurrence.
    expect(numoWatchOccurrenceRequestId(watch.id, "2026-11-08T19:01:00+01:00")).toBe(requestId);
    expect(numoWatchOccurrenceRequestId(watch.id, "2026-11-09T18:01:00.000Z")).not.toBe(requestId);
    await recordNumoWatchOccurrence(service, { id: watch.id, firedAt: claimed!.fired_at! }, { outcome: "acted" });
    expect(await recentActedNumoWatchRequestIds(service, new Date("2026-11-08T00:00:00.000Z"))).toEqual([requestId]);
  });

  it("retries once an occurrence whose clock died after the claim", async () => {
    const rows: Row[] = [];
    const service = fakeService(rows);
    const watch = await recurring(service);
    await advanceRecurringNumoWatch(service, await clockView(service, watch.id),
      { fire: true, now: new Date("2026-11-08T18:01:00.000Z") });
    const later = new Date("2026-11-08T18:30:00.000Z");
    expect((await claimStrandedNumoWatches(service, later)).map((item) => item.id)).toEqual([watch.id]);
    expect(rows[0]).toMatchObject({ status: "active", outcome: "failed" });
    expect(await claimStrandedNumoWatches(service, later)).toEqual([]);
  });

  it("keeps a paused reminder through the retention sweep", async () => {
    const rows: Row[] = [];
    const service = fakeService(rows);
    const kept = await recurring(service);
    const gone = await create(service);
    await pauseNumoWatch(service, ALICE, kept.id);
    await cancelNumoWatch(service, ALICE, gone.id);
    expect(await purgeFinishedNumoWatches(service, "2030-01-01T00:00:00.000Z")).toBe(1);
    expect(rows.map((row) => row.id)).toEqual([kept.id]);
  });
});
