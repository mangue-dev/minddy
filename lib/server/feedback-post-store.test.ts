import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./encryption/store";

const state = vi.hoisted(() => ({ store: null as EncryptedStore | null, hasKey: false }));
vi.mock("./encryption/registry", () => ({
  getEncryptedStore: () => state.store,
  SupabaseKeyRegistry: class { loadCurrent() { return Promise.resolve(state.hasKey ? { version: 1 } : null); } },
}));

import { decodeFeedbackPost, encodeFeedbackPost, feedbackPostStore } from "./feedback-post-store";

const source = {
  id: "post-1", project_id: "project-1", title: "Private request", body: "Sensitive detail",
  submitted_title: "Original request", submitted_body: "Original detail",
  translated_title: "Translated request", translated_body: "Translated detail",
  moderation_reason: "Sensitive reason", embedding: "[0.1,0.2,0.3]",
  status: "open", is_public: false,
};

function client(rows: Record<string, unknown>[], selections: string[]): SupabaseClient {
  return { from(table: string) {
    expect(table).toBe("feedback_posts");
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const query = {
      select(columns: string) { selections.push(columns); return query; },
      eq(column: string, value: unknown) { filters.push((row) => row[column] === value); return query; },
      is(column: string, value: unknown) { filters.push((row) => row[column] === value); return query; },
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
  const key = randomBytes(32);
  state.store = new EncryptedStore({
    current: async () => ({ version: 1, bytes: Buffer.from(key) }),
    byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("feedback source content", () => {
  it("removes every protected field and authenticates the project and row identity", async () => {
    const stored = await encodeFeedbackPost(source);
    for (const field of ["title", "body", "submitted_title", "submitted_body",
      "translated_title", "translated_body", "moderation_reason", "embedding"]) {
      expect(stored[field]).toBeNull();
    }
    expect(JSON.stringify(stored)).not.toContain("Private request");
    expect(await decodeFeedbackPost(stored)).toMatchObject(source);
    await expect(decodeFeedbackPost({ ...stored, project_id: "project-2" })).rejects.toThrow();
    await expect(decodeFeedbackPost({ ...stored, id: "post-2" })).rejects.toThrow();
  });

  it("applies project filters before decoding and returns no ciphertext metadata", async () => {
    const first = await encodeFeedbackPost(source);
    const foreign = await encodeFeedbackPost({ ...source, id: "post-2", project_id: "project-2" });
    const selections: string[] = [];
    const { data } = await feedbackPostStore(client([first, foreign], selections))
      .select("id, title, body").eq("project_id", "project-1");
    expect(data).toEqual([{ id: "post-1", title: "Private request", body: "Sensitive detail" }]);
    expect(selections).toEqual(["*"]);
    expect(JSON.stringify(data)).not.toContain("encrypted_content");
  });

  it("continues encrypted writes after disabling the rollout flag", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false");
    state.hasKey = true;
    expect((await encodeFeedbackPost(source)).encryption_version).toBe(1);
    state.hasKey = false;
    expect(await encodeFeedbackPost(source)).toEqual(source);
  });
});
