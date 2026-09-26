import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./store";
import type { StatEventRow } from "../stat-events";

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({ rows: {} as Record<string, Row[]>, crypto: null as EncryptedStore | null,
  version: 1, beforeWrite: null as ((table: string, patch: Row) => void) | null }));

function query(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  const orders: string[] = [];
  let limit = Infinity;
  let mode = "select";
  let patch: Row = {};
  let inserts: Row[] = [];
  const run = () => {
    if (mode === "update") state.beforeWrite?.(table, patch);
    const all = state.rows[table] ?? [];
    let selected = all.filter((row) => filters.every((filter) => filter(row)));
    selected.sort((a, b) => {
      for (const key of orders) {
        const compared = String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
        if (compared) return compared;
      }
      return 0;
    });
    selected = selected.slice(0, limit);
    if (mode === "update") selected.forEach((row) => Object.assign(row, patch));
    if (mode === "insert") {
      selected = inserts.map((row) => ({ encryption_version: 0, encrypted_content: null,
        encryption_revision: 0, encryption_checked_at: null, ...row }));
      state.rows[table] = [...all, ...selected];
    }
    return { data: structuredClone(selected), error: null };
  };
  const builder = {
    select: () => builder,
    eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return builder; },
    order: (key: string) => { orders.push(key); return builder; },
    limit: (value: number) => { limit = value; return builder; },
    update: (value: Row) => { mode = "update"; patch = value; return builder; },
    insert: (value: Row | Row[]) => { mode = "insert"; inserts = Array.isArray(value) ? value : [value]; return builder; },
    maybeSingle: async () => { const result = run(); return { ...result, data: result.data[0] ?? null }; },
    then: (resolve: (value: ReturnType<typeof run>) => unknown, reject: (error: unknown) => unknown) => Promise.resolve().then(run).then(resolve, reject),
  };
  return builder;
}
const client = { from: query } as unknown as SupabaseClient;
vi.mock("./registry", () => ({ getEncryptedStore: () => {
  if (!state.crypto) throw new Error("Root key unavailable");
  return state.crypto;
} }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => client }));
const { appendStatEvents, insertStatEvents, readStatEvents } = await import("../stat-events");
const { setScratchpad } = await import("../scratchpad");
const { backfillStatEventsBatch } = await import("./stat-events-backfill");

const event = (userId = "user-1"): StatEventRow => ({
  user_id: userId, kind: "scratchpad_task_completed", occurred_at: "2026-09-23T12:00:00Z",
  project_id: null, project_name: "Private project", issue_id: null, issue_number: 12,
  issue_title: "Private issue", task_text: "Private task",
});

beforeEach(() => {
  vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false");
  vi.spyOn(console, "info").mockImplementation(() => {});
  state.rows = {};
  state.version = 1;
  state.beforeWrite = null;
  const keys = new Map([[1, randomBytes(32)], [2, randomBytes(32)]]);
  state.crypto = new EncryptedStore({
    current: async () => ({ version: state.version, bytes: Buffer.from(keys.get(state.version)!) }),
    byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(keys.get(version)!) }),
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("protected statistics snapshots", () => {
  it("reads legacy exports without a root key and includes historical task labels", async () => {
    state.crypto = null;
    await appendStatEvents(client, [event(), event("other-user")]);
    const rows = await readStatEvents(client, "user-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ task_text: "Private task", issue_title: "Private issue" });
    expect(rows[0]).not.toHaveProperty("encrypted_content");
  });

  it("encrypts all three snapshots while keeping the statistics metadata queryable", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    await appendStatEvents(client, [event()]);
    const stored = state.rows.stat_events[0];
    expect(stored).toMatchObject({ project_name: null, issue_title: null, task_text: null,
      kind: "scratchpad_task_completed", occurred_at: event().occurred_at, issue_number: 12, encryption_version: 1 });
    expect(JSON.stringify(stored)).not.toContain("Private");
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false");
    expect((await readStatEvents(client, "user-1"))[0]).toMatchObject({ project_name: "Private project",
      issue_title: "Private issue", task_text: "Private task" });
    stored.user_id = "other-user";
    await expect(readStatEvents(client, "other-user")).rejects.toThrow();
  });

  it("keeps derived task snapshots encrypted when the note was migrated and the flag is disabled", async () => {
    state.rows.user_scratchpad = [{ user_id: "user-1", content: "- [ ] Private task", rev: 1,
      updated_at: "2026-09-22T12:00:00Z", encryption_version: 0, encrypted_content: null }];
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    await setScratchpad(client, "user-1", "- [ ] Private task", 1);
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false");
    expect((await setScratchpad(client, "user-1", "- [x] Private task", 2)).conflicted).toBe(false);
    expect(state.rows.stat_events).toHaveLength(1);
    expect(state.rows.stat_events[0]).toMatchObject({ encryption_version: 1, task_text: null });
    expect((await readStatEvents(client, "user-1"))[0].task_text).toBe("Private task");
  });

  it("never falls back to a plaintext snapshot when encryption fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    state.crypto = null;
    await expect(appendStatEvents(client, [event()], { requireEncryption: true })).rejects.toThrow();
    await insertStatEvents(client, [event()], { requireEncryption: true });
    expect(state.rows.stat_events).toBeUndefined();
    expect(log).toHaveBeenCalledWith("[stat-events] insert failed");
  });

  it("migrates and rotates snapshots without modifying metadata or losing deleted-source content", async () => {
    await appendStatEvents(client, [event()]);
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    expect(await backfillStatEventsBatch()).toMatchObject({ migrated: 1, failed: 0 });
    expect(await backfillStatEventsBatch()).toMatchObject({ migrated: 0, unchanged: 1 });
    state.version = 2;
    expect(await backfillStatEventsBatch()).toMatchObject({ migrated: 1, failed: 0 });
    expect(state.rows.stat_events[0]).toMatchObject({ encryption_version: 2, encryption_revision: 2,
      project_id: null, issue_id: null, kind: event().kind, occurred_at: event().occurred_at });
    expect((await readStatEvents(client, "user-1"))[0].task_text).toBe("Private task");
  });

  it("preserves concurrent snapshot edits and revisits failed rows without starving others", async () => {
    await appendStatEvents(client, [event(), event()]);
    state.rows.stat_events[0].id = "a";
    state.rows.stat_events[1].id = "b";
    state.rows.stat_events[0].encryption_version = 1;
    state.rows.stat_events[0].encrypted_content = "corrupt";
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    expect(await backfillStatEventsBatch(1)).toMatchObject({ failed: 1 });
    state.beforeWrite = (_table, patch) => {
      if (patch.encrypted_content) {
        state.rows.stat_events[1].task_text = "Concurrent change";
        state.rows.stat_events[1].encryption_revision = 1;
      }
    };
    expect(await backfillStatEventsBatch(1)).toMatchObject({ conflicted: 1, failed: 0 });
    expect(state.rows.stat_events[1].task_text).toBe("Concurrent change");
    expect(state.rows.stat_events[1].encrypted_content).toBeNull();
  });
});
