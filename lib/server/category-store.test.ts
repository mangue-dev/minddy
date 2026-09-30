import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./encryption/store";

const state = vi.hoisted(() => ({ store: null as EncryptedStore | null, hasKey: false, unavailable: false }));
vi.mock("./encryption/registry", () => ({
  getEncryptedStore: () => { if (state.unavailable) throw new Error("Private root failure"); return state.store; },
  SupabaseKeyRegistry: class { loadCurrent() { return Promise.resolve(state.hasKey ? { version: 1 } : null); } },
}));

import { categoryStore, decodeCategory, encodeCategory } from "./category-store";

const source = { id: "category-1", project_id: "project-1", name: "Private label", color: "#123456" };

function client(rows: Record<string, unknown>[], selections: string[]): SupabaseClient {
  return { from(table: string) {
    expect(table).toBe("categories");
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let start = 0, end = 999;
    const query = {
      select(columns: string) { selections.push(columns); return query; },
      eq(column: string, value: unknown) { filters.push((row) => row[column] === value); return query; },
      in(column: string, values: unknown[]) { filters.push((row) => values.includes(row[column])); return query; },
      order() { return query; },
      range(from: number, to: number) { start = from; end = to; return query; },
      then(resolve: (result: unknown) => unknown) {
        return Promise.resolve({ data: rows.filter((row) => filters.every((filter) => filter(row))).slice(start, end + 1), error: null }).then(resolve);
      },
    };
    return query;
  } } as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_DATA_ROOT_KEY", "1".repeat(64));
  vi.spyOn(console, "info").mockImplementation(() => {});
  state.hasKey = state.unavailable = false;
  const key = randomBytes(32);
  state.store = new EncryptedStore({
    current: async () => ({ version: 1, bytes: Buffer.from(key) }),
    byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("category content repository", () => {
  it("encrypts names and filters authorized decoded rows without returning storage metadata", async () => {
    const first = await encodeCategory(source);
    const second = await encodeCategory({ ...source, id: "category-2", name: "Other label" });
    expect(first).toMatchObject({ name: null, encryption_version: 1 });
    expect(JSON.stringify(first)).not.toContain("Private label");
    const selections: string[] = [];
    const result = await categoryStore(client([first, second], selections), "actor-1")
      .select("id, name").eq("project_id", "project-1").eq("name", "Private label");
    expect(result.data).toEqual([{ id: "category-1", name: "Private label" }]);
    expect(selections).toEqual(["*"]);
    expect(JSON.stringify(result)).not.toContain("encrypted_content");
  });

  it("leaves metadata available but reports key failure and tampering for protected reads", async () => {
    const stored = await encodeCategory(source);
    state.unavailable = true;
    expect((await categoryStore(client([stored], [])).select("id, color")).data)
      .toEqual([{ id: "category-1", color: "#123456" }]);
    const result = await categoryStore(client([stored], [])).select("name");
    expect(result.error?.code).toBe("CATEGORY_STORAGE");
    state.unavailable = false;
    await expect(decodeCategory({ ...stored, id: "other" })).rejects.toThrow("Unable to decrypt");
  });

  it("continues encrypting existing scopes when rollout writes are disabled", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false");
    state.hasKey = true;
    expect((await encodeCategory(source)).encryption_version).toBe(1);
    state.unavailable = true;
    await expect(encodeCategory(source)).rejects.toThrow("Private root failure");
    state.unavailable = false;
    state.hasKey = false;
    expect(await encodeCategory(source)).toEqual(source);
  });

  it("searches beyond the first database response for exact names", async () => {
    const rows = Array.from({ length: 1000 }, (_, index) => ({ id: `category-${String(index).padStart(4, "0")}`,
      project_id: "project-1", name: `Label ${index}`, color: "#123456",
      encryption_version: 0, encrypted_content: null }));
    rows.push({ id: "category-last", project_id: "project-1", name: "Needed",
      color: "#123456", encryption_version: 0, encrypted_content: null });
    const result = await categoryStore(client(rows, [])).select("id, name").eq("project_id", "project-1")
      .eq("name", "Needed");
    expect(result.data).toEqual([{ id: "category-last", name: "Needed" }]);
  });

  it("rejects storage metadata and aliases", () => {
    const repository = categoryStore(client([], []));
    expect(() => repository.select("encrypted_content")).toThrow("private to the repository");
    expect(() => repository.select("alias:name")).toThrow("private to the repository");
  });
});
