import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./encryption/store";
import { storeIssueEvents, readIssueEvents, hasMatchingIssueEvent } from "./issue-event-store";
import { storePageVersion, readPageVersions } from "./page-version-store";
import { decodeHistoryRow } from "./encryption/history-content";
import { backfillHistoryBatch } from "./encryption/history-backfill";

const state = vi.hoisted(() => ({
  store: null as EncryptedStore | null, service: null as SupabaseClient | null,
  hasKey: false, unavailable: false,
}));
vi.mock("./encryption/registry", () => ({
  getEncryptedStore: () => {
    if (state.unavailable) throw new Error("Private provider error");
    return state.store;
  },
  SupabaseKeyRegistry: class {
    loadCurrent() { return Promise.resolve(state.hasKey ? { version: 1 } : null); }
  },
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => state.service }));

type Row = Record<string, unknown>;
let rows: Record<string, Row[]>;
let requests: { table: string; url: URL; method: string; body: unknown }[];
let failWrites: boolean;
let staleMigration: boolean;
let version: number;

beforeEach(() => {
  vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
  vi.spyOn(console, "info").mockImplementation(() => {});
  state.hasKey = false;
  state.unavailable = false;
  failWrites = false;
  staleMigration = false;
  version = 1;
  const material = randomBytes(32);
  state.store = new EncryptedStore({
    current: async () => ({ version, bytes: Buffer.from(material) }),
    byVersion: async (_scope, asked) => ({ version: asked, bytes: Buffer.from(material) }),
  });
  rows = {
    issues: [{ id: "issue", project_id: "project" }], objectives: [{ id: "objective", project_id: "project-2" }],
    pages: [{ id: "page", project_id: "project" }], feedback_posts: [{ id: "post", project_id: "project-2" }],
    issue_events: [], page_versions: [],
  };
  requests = [];
  state.service = createClient("https://fixture.supabase.co", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      const table = url.pathname.split("/").at(-1)!;
      const body = request.method === "GET" ? null : await request.json();
      requests.push({ table, url, method: request.method, body });
      const result = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
        status, headers: { "content-type": "application/json" },
      });
      if (failWrites && request.method !== "GET") return result({ message: "private database value" }, 400);
      if (request.method === "POST") {
        for (const row of Array.isArray(body) ? body : [body]) rows[table].push({
          encryption_version: 0, encrypted_content: null, encryption_revision: 0, encryption_checked_at: null,
          from_value: null, to_value: null, ...row,
        });
        return new Response(null, { status: 201 });
      }
      const selected = rows[table].filter((row) => [...url.searchParams].every(([key, value]) => {
        if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
        if (value.startsWith("in.(")) return value.slice(4, -1).split(",").includes(String(row[key]));
        if (value === "is.null") return row[key] == null;
        return true;
      }));
      if (request.method === "PATCH") {
        if (staleMigration && body.encrypted_content) return result([]);
        for (const row of selected) Object.assign(row, body);
        return result(selected.map((row) => ({ id: row.id })));
      }
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? selected.length);
      const data = selected.slice(offset, offset + limit);
      return result(request.headers.get("accept")?.includes("vnd.pgrst.object") ? data[0] ?? null : data);
    } },
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const event = { issue_id: "issue", actor_id: "actor", type: "updated", field: "title", from_value: "old private title", to_value: "new private title" };
const snapshot = { page_id: "page", project_id: "project", version: 3, title: "Private wiki title", icon: "book", content: { type: "doc", content: [{ type: "paragraph", text: "Private wiki body" }] } };

describe("encrypted activity and page history repositories", () => {
  it("stores only ciphertext, resolves each parent owner, and reads logical activity", async () => {
    await storeIssueEvents(state.service!, [event,
      { objective_id: "objective", actor_id: null, type: "updated", to_value: "Private objective" },
      { feedback_post_id: "post", actor_id: null, type: "updated", to_value: "Private feedback" },
      { page_id: "page", actor_id: "actor", type: "page_updated" }]);
    expect(JSON.stringify(rows.issue_events)).not.toContain("private title");
    expect(rows.issue_events.map((row) => row.project_id)).toEqual(["project", "project-2", "project-2", "project"]);
    expect(rows.issue_events.every((row) => row.from_value === null && row.to_value === null && row.encryption_version === 1)).toBe(true);
    const result = await readIssueEvents(state.service!, { issue_id: "issue" }, { projectId: "project", actorId: "actor" });
    expect(result.error).toBeNull();
    expect(result.data?.[0]).toMatchObject(event);
    expect(result.data?.[0]).not.toHaveProperty("encrypted_content");
    expect(result.data?.[0]).not.toHaveProperty("encryption_revision");
  });

  it("retains status metadata used by SQL duration statistics", async () => {
    await storeIssueEvents(state.service!, [{ ...event, field: "status", to_value: "in_progress" }]);
    expect(rows.issue_events[0]).toMatchObject({ starts_work: true, to_value: null });
  });

  it("rejects missing or ambiguous parent ownership before writing", async () => {
    await expect(storeIssueEvents(state.service!, [{ ...event, objective_id: "objective" }])).rejects.toThrow("Invalid activity parent");
    await expect(storeIssueEvents(state.service!, [{ ...event, issue_id: "missing" }])).rejects.toThrow("Unable to resolve");
    expect(rows.issue_events).toHaveLength(0);
  });

  it("keeps new histories encrypted when the rollout flag is disabled after a project key exists", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false");
    vi.stubEnv("MINDDY_DATA_KMS_KEY_ID", "fixture-key");
    state.hasKey = true;
    await storeIssueEvents(state.service!, [event]);
    await storePageVersion(state.service!, snapshot);
    expect(rows.issue_events[0].encryption_version).toBe(1);
    expect(rows.page_versions[0].encryption_version).toBe(1);
  });

  it("preserves old installations without initializing a key provider", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false");
    vi.stubEnv("MINDDY_DATA_KMS_KEY_ID", "");
    state.unavailable = true;
    await storeIssueEvents(state.service!, [event]);
    await storePageVersion(state.service!, snapshot);
    expect(rows.issue_events[0]).toMatchObject(event);
    expect((await readPageVersions(state.service!, "page", "project", "actor")).error).toBe(false);
  });

  it("reads titles without returning bodies in lists, and restores the complete selected snapshot", async () => {
    await storePageVersion(state.service!, snapshot);
    expect(JSON.stringify(rows.page_versions)).not.toContain("Private wiki");
    const list = await readPageVersions(state.service!, "page", "project", "actor");
    expect(list.data?.[0]).toMatchObject({ title: snapshot.title, icon: "book" });
    expect(list.data?.[0]).not.toHaveProperty("content");
    const detail = await readPageVersions(state.service!, "page", "project", "actor", String(rows.page_versions[0].id));
    expect(detail.data?.[0]).toMatchObject(snapshot);
    expect((await readPageVersions(state.service!, "other-page", "project", "actor", String(rows.page_versions[0].id))).data).toEqual([]);
  });

  it("loads large history lists in bounded envelope batches, preserving the initial ID order", async () => {
    for (let i = 0; i < 23; i++) await storePageVersion(state.service!, { ...snapshot, version: i });
    const result = await readPageVersions(state.service!, "page", "project", "actor");
    expect(result.data?.map((row) => row.id)).toEqual(rows.page_versions.map((row) => row.id));
    const reads = requests.filter((request) => request.table === "page_versions" && request.method === "GET");
    expect(reads[0].url.searchParams.get("select")).toBe("id");
    expect(reads.slice(1).map((request) => request.url.searchParams.get("id")!.slice(4, -1).split(",").length)).toEqual([10, 10, 3]);
    expect(result.data?.every((row) => !Object.hasOwn(row, "content"))).toBe(true);
  });

  it("fails closed for corruption and cross-project snapshot reads", async () => {
    await storePageVersion(state.service!, snapshot);
    expect(await readPageVersions(state.service!, "page", "wrong-project", "actor")).toEqual({ data: null, error: true });
    rows.page_versions[0].encrypted_content = "corrupt";
    expect(await readPageVersions(state.service!, "page", "project", "actor")).toEqual({ data: null, error: true });
    await storeIssueEvents(state.service!, [event]);
    rows.issue_events[0].id = "transplanted";
    expect((await readIssueEvents(state.service!, { issue_id: "issue" })).error).not.toBeNull();
  });

  it("never returns a partial activity response or falls back to legacy content on KMS failure", async () => {
    rows.issue_events.push({ ...event, id: "legacy" });
    await storeIssueEvents(state.service!, [event]);
    state.unavailable = true;
    expect(await readIssueEvents(state.service!, { issue_id: "issue" })).toEqual({ data: null, error: { message: "Unable to read activity" } });
  });

  it("rejects partial encryption state even when plaintext is present", async () => {
    await expect(decodeHistoryRow("issue_events", { ...event, project_id: "project", encryption_version: 0 }, "actor")).rejects.toThrow();
  });

  it("compares protected PR values after decrypting, without SQL plaintext predicates or a premature limit", async () => {
    rows.issue_events = Array.from({ length: 500 }, (_, i) => ({ ...event, id: String(i), to_value: "different PR" }));
    await storeIssueEvents(state.service!, [{ ...event, to_value: "789", from_value: "private-login" }]);
    expect(await hasMatchingIssueEvent(state.service!, { issueIds: ["issue"], type: "updated", actorIds: ["actor"], after: "2026-01-01", toValue: "789" })).toBe(true);
    const reads = requests.filter((request) => request.method === "GET" && request.table === "issue_events");
    expect(reads.map((request) => request.url.searchParams.get("offset"))).toEqual(["0", "500"]);
    expect(reads.every((request) => !request.url.searchParams.has("to_value") && !request.url.searchParams.has("from_value"))).toBe(true);
  });

  it("distinguishes forge actors when coalescing encrypted events", async () => {
    await storeIssueEvents(state.service!, [{ ...event, actor_id: null, from_value: "gitlab:alice", to_value: "8" }]);
    const input = { issueIds: ["issue"], type: "updated", after: "2026-01-01", toValue: "8" };
    expect(await hasMatchingIssueEvent(state.service!, { ...input, fromValue: "gitlab:bob" })).toBe(false);
    expect(await hasMatchingIssueEvent(state.service!, { ...input, fromValue: "gitlab:alice" })).toBe(true);
  });

  it("does not replace a failed encrypted write with plaintext", async () => {
    state.unavailable = true;
    await expect(storeIssueEvents(state.service!, [event])).rejects.toThrow();
    await expect(storePageVersion(state.service!, snapshot)).rejects.toThrow();
    expect(requests.some((request) => request.method === "POST")).toBe(false);
    state.unavailable = false;
    failWrites = true;
    await expect(storeIssueEvents(state.service!, [event])).rejects.toThrow("Unable to persist activity");
  });

  it.each(["issue_events", "page_versions"] as const)("migrates and rotates %s while honoring revision conflicts", async (table) => {
    const logical = table === "issue_events" ? { ...event, project_id: "project" } : snapshot;
    rows[table] = [{ ...logical, id: "legacy", encryption_version: 0, encrypted_content: null, encryption_revision: 0 }];
    staleMigration = true;
    expect(await backfillHistoryBatch(table)).toMatchObject({ conflicted: 1, migrated: 0 });
    expect(rows[table][0].encryption_version).toBe(0);
    staleMigration = false;
    expect(await backfillHistoryBatch(table)).toMatchObject({ migrated: 1, failed: 0 });
    expect(rows[table][0].encryption_revision).toBe(1);
    version = 2;
    expect(await backfillHistoryBatch(table)).toMatchObject({ migrated: 1, failed: 0 });
    expect(rows[table][0].encryption_version).toBe(2);
    expect(await decodeHistoryRow(table, rows[table][0], "actor")).toMatchObject(logical);
    expect(await backfillHistoryBatch(table)).toMatchObject({ unchanged: 1, failed: 0 });
  });
});
