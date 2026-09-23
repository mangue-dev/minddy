import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commentStore, importComment, syncGithubComment } from "./comment-store";
import { backfillCommentsBatch } from "./encryption/comment-backfill";
import { EncryptedStore } from "./encryption/store";

const state = vi.hoisted(() => ({ store: null as EncryptedStore | null, service: null as SupabaseClient | null,
  unavailable: false, hasKey: false }));
vi.mock("./encryption/registry", () => ({
  getEncryptedStore: () => { if (state.unavailable) throw new Error("Private provider error"); return state.store; },
  SupabaseKeyRegistry: class { loadCurrent() { return Promise.resolve(state.hasKey ? { version: 1 } : null); } },
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => state.service }));
type Row = Record<string, unknown>;
let rows: Record<string, Row[]>;
let requests: { table: string; method: string; url: URL; body: Row }[];
let version: number;
let loseRace: boolean;
let forgeConflict: boolean;
const fixture = { id: "comment", issue_id: "issue", author_id: "actor", body: "Private body", visibility: "internal" };
const pageFixture = { id: "page-comment", page_id: "page", project_id: "project", author_id: "actor", body: "Private reply", quote: "Private quote" };

beforeEach(() => {
  vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_DATA_KMS_KEY_ID", "fixture-key");
  vi.spyOn(console, "info").mockImplementation(() => {});
  state.unavailable = state.hasKey = loseRace = forgeConflict = false;
  version = 1;
  const key = randomBytes(32);
  state.store = new EncryptedStore({ current: async () => ({ version, bytes: Buffer.from(key) }),
    byVersion: async (_scope, asked) => ({ version: asked, bytes: Buffer.from(key) }) });
  rows = { issues: [{ id: "issue", project_id: "project" }], pages: [{ id: "page", project_id: "project" }],
    objectives: [{ id: "objective", project_id: "other" }], feedback_posts: [{ id: "post", project_id: "other" }],
    comments: [], page_comments: [], github_issue_comment_syncs: [] };
  requests = [];
  state.service = createClient("https://fixture.supabase.co", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const req = new Request(input, init), url = new URL(req.url), table = url.pathname.split("/").at(-1)!;
      const body = req.method === "GET" ? {} : await req.json();
      requests.push({ table, method: req.method, url, body });
      const response = (data: unknown) => new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
      if (table === "migrate_comment_ciphertext") {
        const row = rows[body.p_table].find((row) => row.id === body.p_id && row.project_id === body.p_project_id &&
          row.encryption_revision === body.p_revision && row.encryption_version === body.p_previous_version);
        if (!row || loseRace) return response(false);
        if (body.p_encrypted_content) Object.assign(row, { body: null, ...(body.p_table === "page_comments" ? { quote: null } : {}),
          encrypted_content: body.p_encrypted_content, encryption_version: body.p_encryption_version, encryption_revision: Number(row.encryption_revision) + 1 });
        else row.encryption_checked_at = "checked";
        return response(true);
      }
      if (table === "sync_github_issue_comment_atomic") {
        if (forgeConflict) {
          forgeConflict = false;
          rows.github_issue_comment_syncs.push({ issue_id: "issue", remote_comment_id: "remote", comment_id: "race-winner" });
          return response({ state: "conflict", comment_id: "race-winner" });
        }
        rows.comments = [{ id: body.p_comment_id, issue_id: body.p_issue_id, project_id: "project", body: body.p_body,
          encryption_version: body.p_encryption_version, encrypted_content: body.p_encrypted_content }];
        return response({ state: "synced", comment_id: body.p_comment_id });
      }
      const single = req.headers.get("accept")?.includes("vnd.pgrst.object");
      const result = (data: Row[]) => response(single ? data[0] ?? null : data);
      if (req.method === "POST") {
        const row = { encryption_version: 0, encrypted_content: null, encryption_revision: 0, encryption_checked_at: null, ...body };
        rows[table].push(row);
        return url.searchParams.has("select") ? result([row]) : new Response(null, { status: 201 });
      }
      const selected = rows[table].filter((row) => [...url.searchParams].every(([key, value]) => {
        if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
        if (value.startsWith("neq.")) return String(row[key]) !== value.slice(4);
        if (value.startsWith("in.(")) return value.slice(4, -1).split(",").includes(String(row[key]));
        if (value === "is.null") return row[key] == null;
        return true;
      }));
      if (req.method === "PATCH") {
        if (loseRace) return result([]);
        for (const row of selected) Object.assign(row, body, { encryption_revision: Number(row.encryption_revision) + 1 });
        return result(selected);
      }
      return result(selected.slice(0, Number(url.searchParams.get("limit") ?? selected.length)));
    } },
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const store = (table: "comments" | "page_comments" = "comments") => commentStore(state.service!, table, "actor");

describe("encrypted comment repository", () => {
  it("protects each parent kind and decodes requested content after retaining visibility filters", async () => {
    expect((await store().insert(fixture).select("*").single()).data).toMatchObject(fixture);
    await store().insert({ id: "objective-comment", objective_id: "objective", body: "Private objective", visibility: "public" });
    await store().insert({ id: "feedback-comment", feedback_post_id: "post", body: "Private feedback", visibility: "public" });
    expect(rows.comments.map((row) => row.project_id)).toEqual(["project", "other", "other"]);
    expect(JSON.stringify(rows.comments)).not.toContain("Private");
    const result = await store().select("id,body").eq("visibility", "public");
    expect(result.data).toEqual([{ id: "objective-comment", body: "Private objective" }, { id: "feedback-comment", body: "Private feedback" }]);
    expect(requests.at(-1)?.url.searchParams.get("visibility")).toBe("eq.public");
    expect(result.data?.some((row) => "encrypted_content" in row)).toBe(false);
  });

  it("encrypts a page quote together with its body and preserves the quote during edits", async () => {
    await store("page_comments").insert(pageFixture);
    const result = await store("page_comments").update({ body: "Updated body" }).eq("id", "page-comment").select("body,quote").single();
    expect(result).toEqual({ data: { body: "Updated body", quote: "Private quote" }, error: null });
    expect(rows.page_comments[0]).toMatchObject({ body: null, quote: null, encryption_revision: 1 });
    const write = requests.find((request) => request.method === "PATCH")!;
    expect(write.url.searchParams.get("encryption_revision")).toBe("eq.0");
    expect(JSON.stringify(write.body)).not.toContain("Private quote");
  });

  it("reports concurrent body edits instead of overwriting the winning row", async () => {
    await store().insert(fixture);
    loseRace = true;
    const result = await store().update({ body: "Late writer" }).eq("id", fixture.id);
    expect(result.error?.code).toBe("40001");
    expect((await store().select("body").eq("id", fixture.id).single()).data?.body).toBe(fixture.body);
  });

  it("does not initialize KMS for metadata projections", async () => {
    await store().insert(fixture);
    state.unavailable = true;
    expect((await store().select("id,author_id").eq("id", fixture.id).single()).data).toEqual({ id: fixture.id, author_id: "actor" });
    expect(requests.at(-1)?.url.searchParams.get("select")).toBe("id,author_id");
    expect((await store().select("body")).error?.message).toBe("Unable to access comment content");
  });

  it("fails closed on ciphertext transplantation, inconsistent states and wrong parent scope", async () => {
    await store().insert(fixture);
    rows.comments[0].id = "transplanted";
    expect((await store().select("*")).data).toBeNull();
    rows.comments = [{ ...fixture, encryption_version: 0 }];
    expect((await store().select("body")).error).not.toBeNull();
    expect((await store("page_comments").insert({ ...pageFixture, project_id: "wrong" })).error).not.toBeNull();
    expect(rows.page_comments).toEqual([]);
  });

  it("keeps writes encrypted after disabling the rollout flag and reads historical versions", async () => {
    await store().insert(fixture);
    version = 2;
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false");
    state.hasKey = true;
    await store().insert({ ...fixture, id: "next" });
    await store().update({ body: "Changed" }).eq("id", fixture.id);
    expect(rows.comments.map((row) => row.encryption_version)).toEqual([2, 2]);
    expect((await store().select("body").eq("id", fixture.id).single()).data?.body).toBe("Changed");
  });

  it("supports legacy installations without encryption configuration", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false");
    vi.stubEnv("MINDDY_DATA_KMS_KEY_ID", "");
    state.unavailable = true;
    expect((await store().insert(fixture).select("body").single()).data?.body).toBe(fixture.body);
    expect(rows.comments[0].encryption_version).toBe(0);
  });

  it("rejects plaintext predicates and unreviewed query vocabulary", () => {
    expect(() => store().eq("body", "Private")).toThrow("metadata");
    expect(() => store().order("body")).toThrow("metadata");
    expect(() => store().select("encrypted_content")).toThrow("projection");
    expect(() => store().or("body.eq.secret,id.eq.1")).toThrow("filter");
    expect(() => store().update({ project_id: "other" })).toThrow("update");
  });

  it("imports metadata as well as content and rejects foreign ownership and racing edits", async () => {
    await importComment(state.service!, { ...fixture, parent_id: null, via_mcp: true, created_at: "2026-01-01" });
    await importComment(state.service!, { ...fixture, body: "Restored", parent_id: null, via_mcp: false, created_at: "2025-01-01" });
    expect(rows.comments[0]).toMatchObject({ via_mcp: false, created_at: "2025-01-01", body: null });
    expect((await store().select("body").single()).data?.body).toBe("Restored");
    await expect(importComment(state.service!, { ...fixture, author_id: "other" })).rejects.toThrow("ownership");
    loseRace = true;
    await expect(importComment(state.service!, fixture)).rejects.toThrow("Unable to import");
  });

  it("re-encrypts a forge delivery for the winning row ID after a simultaneous first insert", async () => {
    forgeConflict = true;
    await syncGithubComment(state.service!, { p_issue_id: "issue", p_remote_comment_id: "remote", p_author_id: "actor",
      p_body: "Private mirrored body", p_author_login: "actor", p_author_association: "OWNER", p_html_url: null,
      p_created_at_remote: null, p_updated_at_remote: null, p_deleted_at_remote: null });
    const writes = requests.filter((request) => request.table === "sync_github_issue_comment_atomic");
    expect(writes).toHaveLength(2);
    expect(writes[0].body.p_comment_id).not.toBe(writes[1].body.p_comment_id);
    expect(writes[1].body.p_body).toBeNull();
    expect((await store().select("id,body").single()).data).toEqual({ id: "race-winner", body: "Private mirrored body" });
  });

  it("backfills both tables through the timestamp-preserving CAS RPC and revisits rotated rows", async () => {
    rows.comments = [{ ...fixture, project_id: "project", encryption_version: 0, encrypted_content: null, encryption_revision: 0 }];
    rows.page_comments = [{ ...pageFixture, encryption_version: 0, encrypted_content: null, encryption_revision: 0 }];
    expect(await backfillCommentsBatch("comments")).toMatchObject({ migrated: 1, failed: 0 });
    expect(await backfillCommentsBatch("page_comments")).toMatchObject({ migrated: 1, failed: 0 });
    version = 2;
    expect(await backfillCommentsBatch("comments")).toMatchObject({ migrated: 1, failed: 0 });
    expect(rows.comments[0].encryption_version).toBe(2);
    expect((await store("page_comments").select("body,quote").single()).data).toEqual({ body: pageFixture.body, quote: pageFixture.quote });
    expect(requests.filter((r) => r.method === "PATCH")).toEqual([]);
  });
});
