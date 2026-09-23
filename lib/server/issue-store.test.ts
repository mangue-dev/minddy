import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./encryption/store";

const state = vi.hoisted(() => ({ store: null as EncryptedStore | null, hasKey: false }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
    data: state.hasKey ? { project_id: "project-1" } : null, error: null,
  }) }) }) }),
}) }));
vi.mock("./encryption/registry", () => ({
  getEncryptedStore: () => state.store,
  SupabaseKeyRegistry: class { loadCurrent() { return Promise.resolve(state.hasKey ? { version: 1 } : null); } },
}));

import { decodeIssue, encodeIssue, issueStore } from "./issue-store";

const source = {
  id: "issue-1", project_id: "project-1", number: 42,
  title: "Private issue", description: "Private description", plan: "Private plan",
  remote_url: "https://example.test/private", automation_override: { prompt: "Private prompt" },
  status: "backlog",
};

function client(rows: Record<string, unknown>[], selections: string[]): SupabaseClient {
  return { from(table: string) {
    expect(table).toBe("issues");
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const query = {
      select(columns: string) { selections.push(columns); return query; },
      eq(column: string, value: unknown) { filters.push((row) => row[column] === value); return query; },
      then(resolve: (result: unknown) => unknown) {
        return Promise.resolve({ data: rows.filter((row) => filters.every((filter) => filter(row))), error: null }).then(resolve);
      },
    };
    return query;
  } } as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_ISSUE_SOURCE_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_DATA_ROOT_KEY", "1".repeat(64));
  const key = randomBytes(32);
  state.store = new EncryptedStore({
    current: async () => ({ version: 1, bytes: Buffer.from(key) }),
    byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("issue source content", () => {
  it("protects every source field and authenticates the project and issue identity", async () => {
    const stored = await encodeIssue(source);
    for (const field of ["title", "description", "plan", "remote_url", "automation_override"]) {
      expect(stored[field]).toBeNull();
    }
    expect(JSON.stringify(stored)).not.toContain("Private issue");
    expect(await decodeIssue(stored)).toMatchObject(source);
    await expect(decodeIssue({ ...stored, project_id: "project-2" })).rejects.toThrow();
    await expect(decodeIssue({ ...stored, id: "issue-2" })).rejects.toThrow();
  });

  it("filters before decryption and never returns storage columns", async () => {
    const first = await encodeIssue(source);
    const foreign = await encodeIssue({ ...source, id: "issue-2", project_id: "project-2" });
    const selections: string[] = [];
    const { data } = await issueStore(client([first, foreign], selections))
      .select("id, title, plan").eq("project_id", "project-1");
    expect(data).toEqual([{ id: "issue-1", title: "Private issue", plan: "Private plan" }]);
    expect(selections).toEqual(["*"]);
    expect(JSON.stringify(data)).not.toContain("encrypted_content");
  });

  it("rejects SQL content filters and keeps writes encrypted after the flag is disabled", async () => {
    expect(() => issueStore(client([], [])).select("title").eq("title", "Private issue")).toThrow();
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false");
    state.hasKey = true;
    expect((await encodeIssue(source)).encryption_version).toBe(1);
    state.hasKey = false;
    expect(await encodeIssue(source)).toMatchObject(source);
  });
});
