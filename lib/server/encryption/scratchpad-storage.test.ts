import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore, type DataKeyProvider } from "./store";

const state = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  writes: [] as Record<string, unknown>[],
  crypto: null as EncryptedStore | null,
  beforeWrite: null as (() => void) | null,
  insertError: null as { code: string; message: string } | null,
  stats: vi.fn(),
  version: 1,
}));

function query() {
  let mode = "select";
  let patch: Record<string, unknown> = {};
  const filters: Record<string, unknown> = {};
  let limit = Infinity;
  const run = () => {
    if (mode === "insert" && state.insertError) return { data: null, error: state.insertError };
    if (mode !== "select") state.beforeWrite?.();
    let rows = [...state.rows.values()].filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value));
    rows.sort((a, b) => String(a.encryption_checked_at ?? "").localeCompare(String(b.encryption_checked_at ?? "")) || String(a.user_id).localeCompare(String(b.user_id)));
    rows = rows.slice(0, limit);
    if (mode === "insert") {
      if (state.rows.has(String(patch.user_id))) return { data: null, error: { code: "23505" } };
      rows = [{ ...patch, updated_at: "2026-09-23T12:00:00Z", encryption_version: patch.encryption_version ?? 0,
        encrypted_content: patch.encrypted_content ?? null }];
    } else if (mode === "update") rows = rows.map((row) => ({ ...row, ...patch }));
    if (mode !== "select") {
      for (const row of rows) state.rows.set(String(row.user_id), row);
      if (rows.length) state.writes.push({ ...patch });
    }
    return { data: structuredClone(rows), error: null };
  };
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => { filters[column] = value; return builder; },
    order: () => builder,
    limit: (value: number) => { limit = value; return builder; },
    update: (value: Record<string, unknown>) => { mode = "update"; patch = value; return builder; },
    insert: (value: Record<string, unknown>) => { mode = "insert"; patch = value; return builder; },
    maybeSingle: async () => { const result = run(); return { ...result, data: result.data?.[0] ?? null }; },
    then: (resolve: (value: ReturnType<typeof run>) => unknown, reject: (error: unknown) => unknown) => Promise.resolve().then(run).then(resolve, reject),
  };
  return builder;
}

const client = { from: () => query() } as unknown as SupabaseClient;
vi.mock("./registry", () => ({ getEncryptedStore: () => {
  if (!state.crypto) throw new Error("Root key unavailable");
  return state.crypto;
} }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => client }));
vi.mock("@/lib/server/stat-events", () => ({ insertStatEvents: state.stats }));

const { getScratchpad, getScratchpadRow, setScratchpad, applyScratchpadTaskChanges } = await import("../scratchpad");
const { backfillScratchpadsBatch } = await import("./scratchpad-backfill");

function legacy(userId = "user-1", content = "- [ ] Private task") {
  const row = { user_id: userId, content, rev: 4, updated_at: "2026-09-22T12:00:00Z", encryption_version: 0, encrypted_content: null, encryption_checked_at: null };
  state.rows.set(userId, row);
  return row;
}

beforeEach(() => {
  vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false");
  vi.spyOn(console, "info").mockImplementation(() => {});
  state.rows.clear();
  state.writes = [];
  state.stats.mockReset();
  state.beforeWrite = null;
  state.insertError = null;
  state.version = 1;
  const material = randomBytes(32);
  const provider: DataKeyProvider = {
    current: async () => ({ version: state.version, bytes: Buffer.from(material) }),
    byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(material) }),
  };
  state.crypto = new EncryptedStore(provider);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("personal content repository encryption", () => {
  it("serves legacy and pre-migration rows without requiring a root key", async () => {
    state.crypto = null;
    legacy();
    expect((await getScratchpad(client, "user-1")).content).toBe("- [ ] Private task");
    state.rows.set("user-1", { user_id: "user-1", content: "Old schema", rev: 2 });
    expect((await getScratchpad(client, "user-1")).content).toBe("Old schema");
  });

  it("encrypts app/agent edits, returns plaintext through the authorized repository and retains CAS", async () => {
    legacy();
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    const saved = await setScratchpad(client, "user-1", "- [ ] Private replacement", 4);
    expect(saved).toMatchObject({ content: "- [ ] Private replacement", rev: 5, conflicted: false });
    expect(state.rows.get("user-1")).toMatchObject({ content: null, encryption_version: 1 });
    expect(JSON.stringify(state.rows.get("user-1"))).not.toContain("Private replacement");
    expect(await setScratchpad(client, "user-1", "Stale edit", 4)).toMatchObject({ conflicted: true, rev: 5 });
    const toggled = await applyScratchpadTaskChanges(client, "user-1", [{ task_index: 0, state: "completed" }], 5);
    expect(toggled).toMatchObject({ status: "ok", state: { content: "- [x] Private replacement", rev: 6 } });
    expect(state.rows.get("user-1")!.content).toBeNull();
    expect(state.stats).toHaveBeenCalledTimes(1);
  });

  it("continues encrypted reads and writes after the rollout flag is disabled", async () => {
    legacy();
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    await setScratchpad(client, "user-1", "Encrypted first", 4);
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false");
    expect((await getScratchpad(client, "user-1")).content).toBe("Encrypted first");
    await setScratchpad(client, "user-1", "Still encrypted", 5);
    expect(state.rows.get("user-1")!.content).toBeNull();
    expect(JSON.stringify(state.rows.get("user-1"))).not.toContain("Still encrypted");
  });

  it("fails closed on root-key loss or inconsistent persisted state instead of returning an empty note", async () => {
    legacy();
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    await setScratchpad(client, "user-1", "Encrypted content", 4);
    const before = structuredClone(state.rows.get("user-1"));
    state.crypto = null;
    await expect(getScratchpad(client, "user-1")).rejects.toThrow("Root key unavailable");
    await expect(setScratchpad(client, "user-1", "Replacement", 5)).rejects.toThrow("Root key unavailable");
    expect(state.rows.get("user-1")).toEqual(before);
    state.rows.set("user-1", { ...before, encryption_version: 0 });
    await expect(getScratchpad(client, "user-1")).rejects.toThrow("encryption state");
  });

  it("exports decrypted content and imports through the same write without duplicating task statistics", async () => {
    legacy();
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    await setScratchpad(client, "user-1", "- [x] Imported task", 4, { recordCompletions: false });
    const exported = await getScratchpadRow(client, "user-1");
    expect(exported?.content).toBe("- [x] Imported task");
    expect(exported).not.toHaveProperty("encrypted_content");
    expect(exported).not.toHaveProperty("encryption_version");
    expect(state.stats).not.toHaveBeenCalled();
  });

  it("rejects stale recreation after deletion and surfaces non-conflict insert errors", async () => {
    expect(await setScratchpad(client, "user-1", "Stale deleted note", 4)).toMatchObject({ conflicted: true, rev: 0 });
    expect(state.rows.size).toBe(0);
    state.insertError = { code: "XX000", message: "Secret database failure" };
    await expect(setScratchpad(client, "user-1", "First note", 0)).rejects.toThrow("Unable to create scratchpad");
    state.insertError = null;
    expect(await setScratchpad(client, "user-1", "First note", 0)).toMatchObject({ conflicted: false, rev: 1 });
  });

  it("never decrypts a row for another requested owner", async () => {
    legacy();
    expect((await getScratchpad(client, "user-2")).content).toBe("");
    expect(await getScratchpadRow(client, "user-2")).toBeNull();
    expect(console.info).not.toHaveBeenCalled();
  });

  it("migrates and re-encrypts through the production adapter without changing content", async () => {
    const original = legacy();
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    expect(await backfillScratchpadsBatch()).toMatchObject({ migrated: 1, failed: 0 });
    expect(state.rows.get("user-1")).toMatchObject({ rev: 5, content: null, encryption_version: 1 });
    expect((await getScratchpad(client, "user-1")).content).toBe(original.content);
    expect(await backfillScratchpadsBatch()).toMatchObject({ unchanged: 1, migrated: 0 });
    expect(state.rows.get("user-1")!.rev).toBe(5);
    state.version = 2;
    expect(await backfillScratchpadsBatch()).toMatchObject({ migrated: 1, failed: 0 });
    expect(state.rows.get("user-1")).toMatchObject({ rev: 6, encryption_version: 2 });
    expect((await getScratchpad(client, "user-1")).content).toBe(original.content);
  });

  it("checks other users after a corrupt row and preserves a concurrent edit during backfill", async () => {
    legacy();
    legacy("user-2");
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    state.rows.set("user-1", { ...state.rows.get("user-1"), content: null, encryption_version: 1, encrypted_content: "corrupt" });
    expect(await backfillScratchpadsBatch(1)).toMatchObject({ failed: 1, migrated: 0 });
    expect(await backfillScratchpadsBatch(1)).toMatchObject({ migrated: 1, failed: 0 });
    state.rows.delete("user-1");
    legacy("user-3");
    let attempts = 0;
    state.beforeWrite = () => {
      attempts += 1;
      if (attempts === 2) state.rows.set("user-3", { ...state.rows.get("user-3"), content: "Concurrent note", rev: 5 });
    };
    expect(await backfillScratchpadsBatch(1)).toMatchObject({ conflicted: 1, migrated: 0 });
    expect(state.rows.get("user-3")!.content).toBe("Concurrent note");
  });
});
