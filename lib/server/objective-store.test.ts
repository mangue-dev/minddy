import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./encryption/store";

const state = vi.hoisted(() => ({ store: null as EncryptedStore | null, hasKey: false, unavailable: false }));
vi.mock("./encryption/registry", () => ({
  getEncryptedStore: () => { if (state.unavailable) throw new Error("Private root failure"); return state.store; },
  SupabaseKeyRegistry: class { loadCurrent() { return Promise.resolve(state.hasKey ? { version: 1 } : null); } },
}));

import { decodeObjective, encodeObjective, objectiveStore } from "./objective-store";

const source = { id: "objective-1", project_id: "project-1", name: "Private launch",
  description: "Private plan", status: "planned" };

function client(rows: Record<string, unknown>[], selections: string[]): SupabaseClient {
  return { from(table: string) {
    expect(table).toBe("objectives");
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const query = {
      select(columns: string) { selections.push(columns); return query; },
      eq(column: string, value: unknown) { filters.push((row) => row[column] === value); return query; },
      in(column: string, values: unknown[]) { filters.push((row) => values.includes(row[column])); return query; },
      then(resolve: (result: unknown) => unknown) {
        return Promise.resolve({ data: rows.filter((row) => filters.every((filter) => filter(row))), error: null }).then(resolve);
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

describe("objective content repository", () => {
  it("encrypts both source fields and returns only authorized projections", async () => {
    const stored = await encodeObjective(source);
    expect(stored).toMatchObject({ name: null, description: null, encryption_version: 1 });
    expect(JSON.stringify(stored)).not.toContain("Private");
    const selections: string[] = [];
    const result = await objectiveStore(client([stored], selections), "actor-1")
      .select("id, name").eq("project_id", "project-1");
    expect(result).toEqual({ data: [{ id: "objective-1", name: "Private launch" }], error: null,
      count: undefined });
    expect(selections).toEqual(["*"]);
    expect(JSON.stringify(result)).not.toContain("encrypted_content");
  });

  it("keeps metadata readable without a root and fails closed on tampered content", async () => {
    const stored = await encodeObjective(source);
    state.unavailable = true;
    expect((await objectiveStore(client([stored], [])).select("id, status").eq("project_id", "project-1")).data)
      .toEqual([{ id: "objective-1", status: "planned" }]);
    await expect(objectiveStore(client([stored], [])).select("name").eq("project_id", "project-1"))
      .rejects.toThrow("Unable to access objective content");
    state.unavailable = false;
    await expect(decodeObjective({ ...stored, id: "other" })).rejects.toThrow("Unable to decrypt");
    await expect(objectiveStore(client([{ ...stored, project_id: "other" }], [])).select("name"))
      .rejects.toThrow("Unable to access objective content");
  });

  it("continues encrypting after the rollout flag is disabled when a project key exists", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false");
    state.hasKey = true;
    expect((await encodeObjective(source)).encryption_version).toBe(1);
    state.hasKey = false;
    expect(await encodeObjective(source)).toEqual(source);
  });

  it("does not expose storage fields or filter encrypted content in SQL", () => {
    const repository = objectiveStore(client([], []));
    expect(() => repository.select("encrypted_content")).toThrow("private to the repository");
    expect(() => repository.select("cipher:encrypted_content")).toThrow("private to the repository");
    expect(() => repository.select("alias:name")).toThrow("aliases are not supported");
    expect(() => repository.select("id").eq("name", "Private launch")).toThrow("application search");
    expect(() => repository.select("id").order("name")).toThrow("application sort");
  });
});
