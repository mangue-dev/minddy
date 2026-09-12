import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { getNumoConversationDetail, listNumoConversations, resolveNumoConversation, validNumoPatch } from "./conversations";

const auth = vi.hoisted(() => ({ get: vi.fn(), service: vi.fn() }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: auth.service }));
vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser: auth.get }));
import { GET as list, POST as create } from "@/app/api/numo/conversations/route";
import { GET as detail, PATCH as patch } from "@/app/api/numo/conversations/[id]/route";
import { GET as resolve } from "@/app/api/numo/resolve/route";
import { GET as active, PUT as setActive } from "@/app/api/assistant/active-conversation/route";
import { GET as legacyMessages } from "@/app/api/assistant/conversations/[id]/messages/route";

type Row = Record<string, unknown>;
const id = "51400000-0000-4000-8000-000000000020";
const userId = "51400000-0000-4000-8000-000000000001";

function database(tables: Record<string, Row[]> = {}, failedTable?: string) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const from = vi.fn((table: string) => {
    let rows = [...(tables[table] ?? [])];
    let single = false;
    const query = {
      select: (...args: unknown[]) => { calls.push({ table, method: "select", args }); return query; },
      eq: (key: string, value: unknown) => { rows = rows.filter((r) => r[key] === value); return query; },
      is: (key: string, value: unknown) => { rows = rows.filter((r) => r[key] === value); return query; },
      order: (...args: unknown[]) => { calls.push({ table, method: "order", args }); return query; },
      range: (a: number, b: number) => { calls.push({ table, method: "range", args: [a, b] }); rows = rows.slice(a, b + 1); return query; },
      maybeSingle: () => { single = true; return query; },
      single: () => { single = true; return query; },
      insert: (value: Row) => { calls.push({ table, method: "insert", args: [value] }); rows = [{ id, ...value }]; return query; },
      upsert: (value: Row) => { calls.push({ table, method: "upsert", args: [value] }); return query; },
      then: (done: (v: unknown) => unknown) => Promise.resolve({
        data: table === failedTable ? null : single ? rows[0] ?? null : rows,
        error: table === failedTable ? { message: "database unavailable" } : null,
      }).then(done),
    };
    return query;
  });
  const rpc = vi.fn().mockResolvedValue({ error: null });
  return { client: { from, rpc } as unknown as SupabaseClient, from, rpc, calls };
}
const request = (url: string, method = "GET", body?: unknown) => new NextRequest(`https://example.test${url}`, {
  method, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const params = { params: Promise.resolve({ id }) };
const conversation = { id, source: "assistant", legacy_id: id, user_id: userId, project_id: null, detail_href: null };

beforeEach(() => { vi.clearAllMocks(); });

describe("Numo conversation adapter", () => {
  it("reads beyond the PostgREST row cap with a deterministic tie-breaker", async () => {
    const rows = Array.from({ length: 501 }, (_, n) => ({ id: String(n), updated_at: "2026-09-01" }));
    const db = database({ numo_conversation_history: rows });
    expect(await listNumoConversations(db.client)).toEqual(rows);
    expect(db.calls.filter((c) => c.method === "range").map((c) => c.args)).toEqual([[0, 499], [500, 999]]);
    expect(db.calls.filter((c) => c.method === "order").slice(0, 2).map((c) => c.args)).toEqual([
      ["updated_at", { ascending: false }], ["id", { ascending: true }],
    ]);
  });

  it("does not read content for a missing or inaccessible common identity", async () => {
    const db = database();
    expect(await getNumoConversationDetail(db.client, id)).toBeNull();
    expect(db.from).toHaveBeenCalledTimes(1);
  });

  it("preserves worker provenance and attachments while separating tool actions", async () => {
    const worker = { id: "worker", conversation_id: id, source: "agent", kind: "worker_message", role: "assistant", run_id: "old-run", worker_source: "assistant_summary", metadata: {} };
    const message = { id: "message", conversation_id: id, source: "assistant", kind: "message", metadata: { attachments: [{ storage_path: "original.pdf" }] } };
    const action = { id: "action", conversation_id: id, source: "assistant", kind: "action", tool_call_id: "original-call", metadata: {} };
    const work = { id: "old-run", conversation_id: id, pr_number: 42 };
    const db = database({ numo_conversation_history: [conversation], numo_messages: [message, worker, action], numo_work: [work] });
    const result = await getNumoConversationDetail(db.client, id);
    expect(result?.messages).toEqual([message, worker]);
    expect(result?.actions).toEqual([action]);
    expect(result?.work).toEqual([work]);
    expect(db.calls).toContainEqual({ table: "numo_messages", method: "order", args: ["source", { ascending: true }] });
  });

  it("resolves a run to its parent identity and original work detail", async () => {
    const db = database({ numo_work: [{ id: "run", conversation_id: id, detail_href: "/agents?run=run" }] });
    expect(await resolveNumoConversation(db.client, "run", "run")).toEqual({ conversationId: id, workId: "run", detailHref: "/agents?run=run" });
  });

  it("uses an accessible origin for legacy agent links and otherwise preserves their mapping", async () => {
    const db = database({ numo_work_origins: [{ agent_id: "old-agent", conversation_id: id }] });
    expect((await resolveNumoConversation(db.client, "agent", "old-agent"))?.conversationId).toBe(id);
    const member = database({ numo_conversation_ids: [{ id: "common-work", agent_id: "old-agent" }] });
    expect((await resolveNumoConversation(member.client, "agent", "old-agent"))?.conversationId).toBe("common-work");
    expect(await resolveNumoConversation(member.client, "assistant", "old-agent")).toBeNull();
  });

  it("rejects changes to ownership, project context and visibility", () => {
    for (const value of [null, [], {}, { visibility: "project" }, { project_id: id }, { user_id: userId }, { pinned: "true" }, { title: "x".repeat(201) }]) {
      expect(validNumoPatch(value)).toBe(false);
    }
    expect(validNumoPatch({ title: null, pinned: false, archived: true, read: true })).toBe(true);
    expect(validNumoPatch({ model: "openai/gpt-5.6", reasoningLevel: "high" })).toBe(true);
    expect(validNumoPatch({ reasoningLevel: "unsupported" })).toBe(false);
  });
});

describe("Numo conversation routes", () => {
  it("requires authentication before every operation", async () => {
    auth.get.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    const responses = await Promise.all([
      list(request("/api/numo/conversations")), create(request("/api/numo/conversations", "POST", {})),
      detail(request(`/api/numo/conversations/${id}`), params), patch(request(`/api/numo/conversations/${id}`, "PATCH", {}), params),
      resolve(request(`/api/numo/resolve?source=run&id=${id}`)), active(request("/api/assistant/active-conversation")),
    ]);
    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401, 401, 401]);
  });

  it("creates a projectless conversation owned by the authenticated user", async () => {
    const db = database({ numo_conversation_history: [conversation] });
    auth.get.mockResolvedValue({ ok: true, user: { id: userId }, supabase: db.client });
    expect((await create(request("/api/numo/conversations", "POST", {}))).status).toBe(201);
    expect(db.calls).toContainEqual({ table: "conversations", method: "insert", args: [{ user_id: userId, title: null, project_id: null }] });
  });

  it("rejects project context that the caller cannot read", async () => {
    const db = database();
    auth.get.mockResolvedValue({ ok: true, user: { id: userId }, supabase: db.client });
    expect((await create(request("/api/numo/conversations", "POST", { projectId: id }))).status).toBe(404);
    expect(db.calls.some((c) => c.method === "insert")).toBe(false);
  });

  it("returns an error instead of disguising a database failure as an empty history", async () => {
    const db = database({}, "numo_conversation_history");
    auth.get.mockResolvedValue({ ok: true, user: { id: userId }, supabase: db.client });
    expect((await list(request("/api/numo/conversations"))).status).toBe(500);
  });

  it("passes only validated state updates and the authenticated actor to the server RPC", async () => {
    const db = database();
    auth.get.mockResolvedValue({ ok: true, user: { id: userId }, supabase: db.client });
    auth.service.mockReturnValue(db.client);
    expect((await patch(request(`/api/numo/conversations/${id}`, "PATCH", { visibility: "project" }), params)).status).toBe(400);
    expect(db.rpc).not.toHaveBeenCalled();
    expect((await patch(request(`/api/numo/conversations/${id}`, "PATCH", { pinned: true }), params)).status).toBe(204);
    expect(db.rpc).toHaveBeenCalledWith("update_numo_conversation", { p_id: id, p_actor: userId, p_patch: { pinned: true } });
    db.rpc.mockResolvedValue({ error: { code: "P0002" } });
    expect((await patch(request(`/api/numo/conversations/${id}`, "PATCH", { read: true }), params)).status).toBe(404);
  });

  it("keeps worker messages out of the legacy assistant renderer", async () => {
    const db = database({ numo_conversation_history: [{ ...conversation, source: "agent", detail_href: "/agents?run=old" }] });
    auth.get.mockResolvedValue({ ok: true, user: { id: userId }, supabase: db.client });
    const result = await legacyMessages(request(`/api/assistant/conversations/${id}/messages`), params);
    expect(result.status).toBe(409);
    expect(db.from).toHaveBeenCalledTimes(1);
  });

  it("restores a work pointer and suppresses pointers after access is lost", async () => {
    const db = database({ assistant_active_conversation: [{ user_id: userId, conversation_id: id }],
      numo_conversation_history: [{ ...conversation, source: "agent", detail_href: "/agents?run=old" }] });
    auth.get.mockResolvedValue({ ok: true, user: { id: userId }, supabase: db.client });
    expect(await (await active(request("/api/assistant/active-conversation"))).json()).toEqual({ conversationId: id, projectId: null, detailHref: "/agents?run=old" });
    const revoked = database({ assistant_active_conversation: [{ user_id: userId, conversation_id: id }] });
    auth.get.mockResolvedValue({ ok: true, user: { id: userId }, supabase: revoked.client });
    expect(await (await active(request("/api/assistant/active-conversation"))).json()).toEqual({ conversationId: null, projectId: null, detailHref: null });
    expect((await setActive(request("/api/assistant/active-conversation", "PUT", { conversationId: id }))).status).toBe(404);
  });
});
