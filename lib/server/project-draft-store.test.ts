import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./encryption/store";

const state = vi.hoisted(() => ({
  store: null as EncryptedStore | null, hasKey: false,
  rows: [] as Record<string, unknown>[],
  calls: [] as Record<string, unknown>[],
  conflictOnce: false,
  registryMissing: false,
  rpcMissing: false,
}));
vi.mock("./encryption/registry", () => ({
  getEncryptedStore: () => state.store,
  SupabaseKeyRegistry: class { loadCurrent() {
    if (state.registryMissing) return Promise.reject(new Error("Unable to load current data key: PGRST205"));
    return Promise.resolve(state.hasKey ? { version: 1 } : null);
  } },
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    rpc: async (_name: string, args: Record<string, unknown>) => {
      state.calls.push(args);
      if (state.rpcMissing) return { data: null, error: { code: "PGRST202" } };
      const prior = state.rows.find((row) => row.id === args.p_id);
      if (state.conflictOnce && prior) {
        state.conflictOnce = false;
        prior.encryption_revision = Number(prior.encryption_revision) + 1;
        return { data: null, error: { code: "40001" } };
      }
      if (prior && prior.user_id !== args.p_actor_id) return { data: null, error: { code: "42501" } };
      if (prior && prior.encryption_revision !== args.p_expected_revision) {
        return { data: null, error: { code: "40001" } };
      }
      const row = {
        id: args.p_id, user_id: args.p_actor_id, name: args.p_name,
        step: args.p_step, data: args.p_data,
        encryption_version: args.p_encryption_version,
        encrypted_content: args.p_encrypted_content,
        encryption_revision: prior ? Number(prior.encryption_revision) + 1 : 0,
        updated_at: "2026-09-23T00:00:00Z",
      };
      if (prior) Object.assign(prior, row);
      else state.rows.push(row);
      return { data: row, error: null };
    },
  }),
}));

import { decodeProjectDraft, listProjectDrafts, saveProjectDraft } from "./project-draft-store";

function client(actorId: string): SupabaseClient {
  return { from(table: string) {
    expect(table).toBe("project_drafts");
    let rows = state.rows;
    const query = {
      select() { return query; },
      eq(column: string, value: unknown) {
        rows = rows.filter((row) => row[column] === value);
        return query;
      },
      order() { return query; },
      upsert(row: Record<string, unknown>) {
        const prior = state.rows.find((candidate) => candidate.id === row.id);
        const written = { ...row, updated_at: "2026-09-23T00:00:00Z" };
        if (prior) Object.assign(prior, written);
        else state.rows.push(written);
        rows = [prior ?? written];
        return query;
      },
      single: async () => ({ data: rows[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: rows.find((row) => row.user_id === actorId) ?? null, error: null }),
      then(resolve: (result: unknown) => unknown) {
        return Promise.resolve({ data: rows.filter((row) => row.user_id === actorId), error: null }).then(resolve);
      },
    };
    return query;
  } } as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_DATA_ROOT_KEY", "1".repeat(64));
  vi.spyOn(console, "info").mockImplementation(() => {});
  state.rows = []; state.calls = []; state.hasKey = false; state.conflictOnce = false;
  state.registryMissing = state.rpcMissing = false;
  const key = randomBytes(32);
  state.store = new EncryptedStore({
    current: async () => ({ version: 1, bytes: Buffer.from(key) }),
    byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("project draft repository", () => {
  it("encrypts the full wizard state and returns only the owner's decoded draft", async () => {
    const input = { id: "draft-1", name: "Private launch", step: "seed",
      data: { seed: { kind: "brief", text: "Private brief" }, icon: { kind: "file", previewUrl: "data:image/webp;base64,private" } } };
    expect(await saveProjectDraft(client("user-1"), "user-1", input)).toMatchObject(input);
    expect(state.calls[0]).toMatchObject({ p_name: null, p_data: null, p_encryption_version: 1 });
    expect(JSON.stringify(state.rows)).not.toContain("Private");
    expect(await listProjectDrafts(client("user-1"), "user-1")).toMatchObject([input]);
    expect(await listProjectDrafts(client("user-2"), "user-2")).toEqual([]);
    await expect(decodeProjectDraft(state.rows[0], "user-2")).rejects.toThrow("owner mismatch");
  });

  it("rejects ciphertext tampering and keeps encrypting after the rollout flag is disabled", async () => {
    const input = { id: "draft-2", name: "Private draft", step: "project", data: { key: "secret" } };
    await saveProjectDraft(client("user-1"), "user-1", input);
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false");
    state.hasKey = true;
    await saveProjectDraft(client("user-1"), "user-1", { ...input, step: "icon" });
    expect(state.calls[1]).toMatchObject({ p_encryption_version: 1, p_expected_revision: 0 });
    await expect(decodeProjectDraft({ ...state.rows[0], id: "other" }, "user-1"))
      .rejects.toThrow("Unable to decrypt");
  });

  it("retries a concurrent edit against the refreshed revision", async () => {
    const input = { id: "draft-3", name: "Private draft", step: "project", data: { key: "secret" } };
    await saveProjectDraft(client("user-1"), "user-1", input);
    state.conflictOnce = true;
    expect(await saveProjectDraft(client("user-1"), "user-1", { ...input, step: "finish" }))
      .toMatchObject({ step: "finish" });
    expect(state.calls.slice(1).map((call) => call.p_expected_revision)).toEqual([0, 1]);
  });

  it("uses legacy writes only for an unmigrated preview with the staging flag off", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false");
    state.registryMissing = state.rpcMissing = true;
    const input = { id: "draft-4", name: "Private draft", step: "project", data: { key: "secret" } };
    expect(await saveProjectDraft(client("user-1"), "user-1", input)).toMatchObject(input);
    expect(state.rows[0]).not.toHaveProperty("encrypted_content");
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    await expect(saveProjectDraft(client("user-1"), "user-1", input))
      .rejects.toThrow("encryption schema is unavailable");
  });
});
