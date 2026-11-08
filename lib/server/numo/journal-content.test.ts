import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { EncryptedStore } from "@/lib/server/encryption/store";

const secret = randomBytes(32);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(secret) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(secret) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));

import {
  NUMO_JOURNAL_MAX_LENGTH,
  NUMO_JOURNAL_OPEN_LIMIT,
  closeJournalEntry,
  decodeNumoJournalRow,
  encodeNumoJournalRow,
  listOpenJournalEntries,
  listUnseenJournalEntries,
  markJournalEntriesSeen,
  normalizeJournalContent,
  purgeJournalEntries,
  listAllJournalEntries,
  writeJournalEntry,
} from "./journal-content";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const PROJECT = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, unknown>;

/**
 * A PostgREST stand-in over one in-memory table. It applies the filters the
 * repository sends (`eq`, `in`, `is`, `not … is null`, `lt`, and the one `or`
 * of the retention sweep), so a missing owner or state filter shows up as a
 * leak or a wrong row.
 */
function fakeService(rows: Row[]) {
  const from = (table: string) => {
    expect(table).toBe("numo_journal_entries");
    const filters: Array<(row: Row) => boolean> = [];
    let operation: "select" | "insert" | "update" | "delete" = "select";
    let patch: Row = {};
    let count = false;
    const matching = () => rows.filter((row) => filters.every((filter) => filter(row)));
    const run = () => {
      if (operation === "insert") return [patch];
      const hit = matching();
      if (operation === "update") for (const row of hit) Object.assign(row, patch);
      if (operation === "delete") {
        for (const row of hit) rows.splice(rows.indexOf(row), 1);
      }
      return hit.map((row) => ({ ...row }));
    };
    const chain: Record<string, unknown> = {
      select: (_columns: string, options?: { count?: string }) => {
        count ||= !!options?.count;
        return chain;
      },
      insert: (row: Row) => {
        operation = "insert";
        patch = { seen_at: null, closed_at: null, ...row };
        rows.push({ ...patch });
        return chain;
      },
      update: (value: Row) => { operation = "update"; patch = value; return chain; },
      delete: (options?: { count?: string }) => {
        operation = "delete";
        count = !!options?.count;
        return chain;
      },
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return chain;
      },
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return chain;
      },
      is: (column: string, value: null) => {
        filters.push((row) => (row[column] ?? null) === value);
        return chain;
      },
      not: (column: string, operator: string, value: null) => {
        expect([operator, value]).toEqual(["is", null]);
        filters.push((row) => row[column] != null);
        return chain;
      },
      lt: (column: string, value: string) => {
        filters.push((row) => typeof row[column] === "string" && (row[column] as string) < value);
        return chain;
      },
      or: (expression: string) => {
        const match = /^seen_at\.not\.is\.null,closed_at\.lt\.(.+)$/.exec(expression);
        expect(match).not.toBeNull();
        const before = match![1];
        filters.push((row) => row.seen_at != null ||
          (typeof row.closed_at === "string" && row.closed_at < before));
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      single: async () => ({ data: run()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => void) => {
        const data = run();
        resolve(count ? { count: data.length, data, error: null } : { data, error: null });
      },
    };
    return chain;
  };
  return { from } as unknown as SupabaseClient;
}

beforeEach(() => vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false"));
afterEach(() => vi.unstubAllEnvs());

describe("Numo journal content", () => {
  it("seals the sentence and the closing reason together under the user's key", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    const saved = await encodeNumoJournalRow({
      id: "44444444-4444-4444-8444-444444444444", user_id: ALICE, project_id: null,
      source: "conversation", content: "Waiting for the client's answer",
      closed_reason: "The client answered",
    }, ALICE);
    expect(saved).toMatchObject({ content: null, closed_reason: null, encryption_version: 1 });
    expect(JSON.stringify(saved)).not.toContain("client");
    const decoded = await decodeNumoJournalRow(saved, ALICE);
    expect(decoded).toMatchObject({
      content: "Waiting for the client's answer", closed_reason: "The client answered",
    });
    await expect(decodeNumoJournalRow({ ...saved, user_id: BOB }, BOB)).rejects.toThrow();
    await expect(decodeNumoJournalRow({ ...saved }, BOB)).rejects.toThrow("owner");
  });

  it("stores one trimmed sentence of 500 characters at most", () => {
    expect(normalizeJournalContent("  PR #12 waits\n for   review ")).toBe("PR #12 waits for review");
    expect(normalizeJournalContent("   ")).toBeNull();
    expect(normalizeJournalContent("a".repeat(NUMO_JOURNAL_MAX_LENGTH))).toHaveLength(500);
    expect(normalizeJournalContent("a".repeat(NUMO_JOURNAL_MAX_LENGTH + 1))).toBeNull();
  });
});

describe("Numo journal repository", () => {
  it("writes, closes and lists the open entries of one user", async () => {
    const service = fakeService([]);
    const entry = await writeJournalEntry(service, ALICE, {
      content: "PR #12 has waited for your review for 3 days", projectId: PROJECT,
      source: "wake",
    });
    expect(entry).toMatchObject({ project_id: PROJECT, source: "wake", closed_at: null });
    expect((await listOpenJournalEntries(service, ALICE)).map((open) => open.id)).toEqual([entry.id]);

    const closed = await closeJournalEntry(service, ALICE, entry.id, "The PR was reviewed");
    expect(closed).toMatchObject({ closed_reason: "The PR was reviewed",
      content: "PR #12 has waited for your review for 3 days" });
    expect(closed.closed_at).not.toBeNull();
    expect(await listOpenJournalEntries(service, ALICE)).toEqual([]);
    // Closing twice is refused rather than rewriting the reason.
    await expect(closeJournalEntry(service, ALICE, entry.id, "Again"))
      .rejects.toMatchObject({ code: "not_found" });
  });

  it("re-seals a sealed entry with its reason when it is closed", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    const rows: Row[] = [];
    const service = fakeService(rows);
    const entry = await writeJournalEntry(service, ALICE, {
      content: "Waiting for the client", projectId: null, source: "conversation",
    });
    await closeJournalEntry(service, ALICE, entry.id, "The client answered");
    expect(rows[0]).toMatchObject({ content: null, closed_reason: null, encryption_version: 1 });
    expect(JSON.stringify(rows[0])).not.toContain("client");
  });

  it("lists closed entries the user has not seen yet, and forgets them once seen", async () => {
    const service = fakeService([]);
    const open = await writeJournalEntry(service, ALICE,
      { content: "Waiting for review", projectId: null, source: "wake" });
    const settled = await writeJournalEntry(service, ALICE,
      { content: "Waiting for the client", projectId: null, source: "conversation" });
    await closeJournalEntry(service, ALICE, settled.id, "The client answered");

    expect((await listUnseenJournalEntries(service, ALICE)).map((entry) => entry.id).sort())
      .toEqual([open.id, settled.id].sort());
    expect(await markJournalEntriesSeen(service, ALICE, [open.id, settled.id])).toBe(2);
    expect(await listUnseenJournalEntries(service, ALICE)).toEqual([]);
    // Seen once is seen: a second visit does not move the date.
    expect(await markJournalEntriesSeen(service, ALICE, [open.id])).toBe(0);
  });

  it("never reads, closes or marks another user's entries", async () => {
    const service = fakeService([]);
    const alices = await writeJournalEntry(service, ALICE,
      { content: "Alice's", projectId: null, source: "conversation" });
    await writeJournalEntry(service, BOB, { content: "Bob's", projectId: null, source: "conversation" });

    expect((await listOpenJournalEntries(service, BOB)).map((entry) => entry.content)).toEqual(["Bob's"]);
    expect((await listUnseenJournalEntries(service, BOB)).map((entry) => entry.content)).toEqual(["Bob's"]);
    await expect(closeJournalEntry(service, BOB, alices.id, "Taken"))
      .rejects.toMatchObject({ code: "not_found" });
    expect(await markJournalEntriesSeen(service, BOB, [alices.id])).toBe(0);
    expect((await listOpenJournalEntries(service, ALICE))[0]).toMatchObject({
      id: alices.id, seen_at: null, closed_at: null,
    });
  });

  it("refuses a new entry past the open limit, and counts only open ones", async () => {
    const rows: Row[] = Array.from({ length: NUMO_JOURNAL_OPEN_LIMIT }, (_, index) => ({
      id: `e-${index}`, user_id: ALICE, closed_at: null,
    }));
    const service = fakeService(rows);
    await expect(writeJournalEntry(service, ALICE,
      { content: "One more", projectId: null, source: "conversation" }))
      .rejects.toMatchObject({ code: "limit_reached" });
    rows[0].closed_at = "2026-11-01T00:00:00.000Z";
    await expect(writeJournalEntry(service, ALICE,
      { content: "One more", projectId: null, source: "conversation" })).resolves.toBeTruthy();
  });

  it("purges closed entries past their period, and open ones Numo never closed", async () => {
    const row = (id: string, closed: string | null, seen: string | null,
      created = "2026-10-01T00:00:00.000Z") =>
      ({ id, user_id: ALICE, closed_at: closed, seen_at: seen, created_at: created });
    const rows: Row[] = [
      row("open-recent", null, "2026-10-02T00:00:00.000Z"),
      row("open-stale", null, null, "2026-04-01T00:00:00.000Z"),
      row("seen-old", "2026-07-01T00:00:00.000Z", "2026-07-02T00:00:00.000Z"),
      row("seen-recent", "2026-10-01T00:00:00.000Z", "2026-10-02T00:00:00.000Z"),
      row("unseen-old", "2026-07-01T00:00:00.000Z", null),
      row("unseen-ancient", "2026-03-01T00:00:00.000Z", null),
    ];
    const deleted = await purgeJournalEntries(fakeService(rows), {
      closedBefore: "2026-08-10T00:00:00.000Z",
      unseenClosedBefore: "2026-05-12T00:00:00.000Z",
      openBefore: "2026-05-12T00:00:00.000Z",
    });
    expect(deleted).toBe(3);
    expect(rows.map((kept) => kept.id)).toEqual(["open-recent", "seen-recent", "unseen-old"]);
  });

  it("in a scoped turn, closes only the entries of its project or of no project", async () => {
    const service = fakeService([]);
    const other = await writeJournalEntry(service, ALICE,
      { content: "About another project", projectId: PROJECT, source: "conversation" });
    const general = await writeJournalEntry(service, ALICE,
      { content: "About no project", projectId: null, source: "conversation" });
    const scope = { projectId: "55555555-5555-4555-8555-555555555555" };
    await expect(closeJournalEntry(service, ALICE, other.id, "Injected", { scope }))
      .rejects.toMatchObject({ code: "not_found" });
    await expect(closeJournalEntry(service, ALICE, general.id, "Settled", { scope }))
      .resolves.toMatchObject({ closed_reason: "Settled" });
    await expect(closeJournalEntry(service, ALICE, other.id, "Settled", { scope: { projectId: PROJECT } }))
      .resolves.toMatchObject({ closed_reason: "Settled" });
  });

  it("keeps a sealed entry sealed when it is closed after encryption was switched off", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    const rows: Row[] = [];
    const service = fakeService(rows);
    const entry = await writeJournalEntry(service, ALICE,
      { content: "Waiting for the client", projectId: null, source: "conversation" });
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false");
    await closeJournalEntry(service, ALICE, entry.id, "The client answered");
    expect(rows[0]).toMatchObject({ content: null, closed_reason: null, encryption_version: 1 });
    expect((await listAllJournalEntries(service, ALICE))[0])
      .toMatchObject({ content: "Waiting for the client", closed_reason: "The client answered" });
  });

  it("refuses to close a row that no longer decodes, as an unknown entry", async () => {
    const rows: Row[] = [{ id: "66666666-6666-4666-8666-666666666666", user_id: ALICE,
      content: null, closed_reason: null, encrypted_content: "garbage", encryption_version: 1,
      source: "conversation", closed_at: null, seen_at: null, created_at: "2026-11-01T00:00:00.000Z" }];
    await expect(closeJournalEntry(fakeService(rows), ALICE, rows[0].id as string, "x"))
      .rejects.toMatchObject({ code: "not_found" });
  });

  it("marks only well-formed ids as seen", async () => {
    const service = fakeService([]);
    const entry = await writeJournalEntry(service, ALICE,
      { content: "Waiting", projectId: null, source: "wake" });
    expect(await markJournalEntriesSeen(service, ALICE, ["MIN-42", entry.id])).toBe(1);
  });
});
