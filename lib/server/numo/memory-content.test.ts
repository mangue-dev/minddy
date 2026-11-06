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
  createNumoMemory,
  decodeNumoMemoryRow,
  deleteAllNumoMemories,
  deleteNumoMemory,
  encodeNumoMemoryRow,
  listNumoMemories,
  updateNumoMemory,
} from "./memory-content";
import { NUMO_MEMORY_LIMIT, NUMO_MEMORY_MAX_LENGTH, normalizeNumoMemoryContent } from "@/lib/numo-memory";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const PROJECT = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, unknown>;

/**
 * A PostgREST stand-in over one in-memory table: it applies the `eq` and `in`
 * filters the repository sends, so a missing owner filter shows up as a leak.
 */
function fakeService(rows: Row[]) {
  const from = (table: string) => {
    expect(table).toBe("numo_memories");
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
        count = !!options?.count;
        return chain;
      },
      insert: (row: Row) => {
        operation = "insert";
        patch = row;
        rows.push({ ...row });
        return chain;
      },
      update: (value: Row) => { operation = "update"; patch = value; return chain; },
      delete: () => { operation = "delete"; return chain; },
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return chain;
      },
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return chain;
      },
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

beforeEach(() => vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false"));
afterEach(() => vi.unstubAllEnvs());

describe("Numo memory content", () => {
  it("seals the text under the user's key when content encryption is on", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    const row = { id: "44444444-4444-4444-8444-444444444444", user_id: ALICE,
      project_id: null, content: "Write my issue titles in English" };
    const saved = await encodeNumoMemoryRow(row, ALICE);
    expect(saved.content).toBeNull();
    expect(saved.encryption_version).toBe(1);
    expect(JSON.stringify(saved)).not.toContain("English");
    const decoded = await decodeNumoMemoryRow(saved, ALICE);
    expect(decoded.content).toBe("Write my issue titles in English");
    // Another user's key scope or row cannot open it.
    await expect(decodeNumoMemoryRow({ ...saved, user_id: BOB }, BOB)).rejects.toThrow();
    await expect(decodeNumoMemoryRow({ ...saved }, BOB)).rejects.toThrow("owner");
  });

  it("writes clear text while content encryption is off", async () => {
    const saved = await encodeNumoMemoryRow({ id: "x", user_id: ALICE, content: "Hi" }, ALICE);
    expect(saved).toMatchObject({ content: "Hi", encryption_version: 0, encrypted_content: null });
  });

  it("stores one trimmed statement of 1,000 characters at most", () => {
    expect(normalizeNumoMemoryContent("  Paused\n until   January ")).toBe("Paused until January");
    expect(normalizeNumoMemoryContent("   ")).toBeNull();
    expect(normalizeNumoMemoryContent("a".repeat(NUMO_MEMORY_MAX_LENGTH))).toHaveLength(1000);
    expect(normalizeNumoMemoryContent("a".repeat(NUMO_MEMORY_MAX_LENGTH + 1))).toBeNull();
    expect(normalizeNumoMemoryContent(42)).toBeNull();
  });
});

describe("Numo memory repository", () => {
  it("creates, lists, rewrites and deletes the memories of one user", async () => {
    const rows: Row[] = [];
    const service = fakeService(rows);
    const created = await createNumoMemory(service, ALICE, {
      content: "The X project is paused until January", projectId: PROJECT,
    });
    expect(created).toMatchObject({ project_id: PROJECT,
      content: "The X project is paused until January" });

    const updated = await updateNumoMemory(service, ALICE, created.id,
      { content: "The X project is paused until March" });
    expect(updated).toMatchObject({ id: created.id, project_id: PROJECT,
      content: "The X project is paused until March" });

    expect((await listNumoMemories(service, ALICE)).map((memory) => memory.content))
      .toEqual(["The X project is paused until March"]);
    expect(await deleteNumoMemory(service, ALICE, created.id)).toBe(true);
    expect(await listNumoMemories(service, ALICE)).toEqual([]);
  });

  it("never reads, rewrites or deletes another user's memory", async () => {
    const rows: Row[] = [];
    const service = fakeService(rows);
    const alices = await createNumoMemory(service, ALICE, { content: "Alice's", projectId: null });
    await createNumoMemory(service, BOB, { content: "Bob's", projectId: null });

    expect((await listNumoMemories(service, BOB)).map((memory) => memory.content))
      .toEqual(["Bob's"]);
    await expect(updateNumoMemory(service, BOB, alices.id, { content: "Taken" }))
      .rejects.toMatchObject({ code: "not_found" });
    expect(await deleteNumoMemory(service, BOB, alices.id)).toBe(false);
    expect(await deleteAllNumoMemories(service, BOB)).toBe(1);
    expect((await listNumoMemories(service, ALICE)).map((memory) => memory.content))
      .toEqual(["Alice's"]);
  });

  it("refuses a new memory past the limit, but still lets one be rewritten", async () => {
    const rows: Row[] = Array.from({ length: NUMO_MEMORY_LIMIT }, (_, index) => ({
      id: `m-${index}`, user_id: ALICE, project_id: null, content: `Memory ${index}`,
      encrypted_content: null, encryption_version: 0,
    }));
    const service = fakeService(rows);
    await expect(createNumoMemory(service, ALICE, { content: "One more", projectId: null }))
      .rejects.toMatchObject({ code: "limit_reached" });
    await expect(updateNumoMemory(service, ALICE, "m-0", { content: "Rewritten" }))
      .resolves.toMatchObject({ content: "Rewritten" });
    // The limit is per user.
    await expect(createNumoMemory(service, BOB, { content: "Bob's first", projectId: null }))
      .resolves.toMatchObject({ content: "Bob's first" });
  });

  it("refuses empty or overlong text", async () => {
    const service = fakeService([]);
    await expect(createNumoMemory(service, ALICE, { content: " ", projectId: null }))
      .rejects.toMatchObject({ code: "invalid_content" });
    await expect(createNumoMemory(service, ALICE, {
      content: "a".repeat(NUMO_MEMORY_MAX_LENGTH + 1), projectId: null,
    })).rejects.toMatchObject({ code: "invalid_content" });
  });
});
