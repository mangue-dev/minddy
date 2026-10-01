import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({
  rows: new Map<string, Array<Record<string, unknown>>>(),
  failCascade: false,
  operations: [] as Array<{ table: string; action: string }>,
  versionReadGate: null as Promise<void> | null,
  receiptInsertGate: null as Promise<void> | null,
  beforeReceiptInsert: null as (() => void) | null,
  protectIntent: vi.fn(async () => false),
  encodeIntent: vi.fn(async (userId: string, conversationId: string, requestId: string, _value: Record<string, unknown>) => ({
    encrypted_intent: "test-ciphertext", encryption_version: 1,
    user_id: userId, conversation_id: conversationId, request_id: requestId,
  })),
}));
function query(table: string) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  const orders: Array<{ key: string; ascending: boolean }> = [];
  let rowLimit = Infinity;
  let insertion: Record<string, unknown> | undefined;
  let patch: Record<string, unknown> | undefined;
  const execute = () => {
    h.operations.push({ table, action: insertion ? "insert" : patch ? "update" : "read" });
    const rows = h.rows.get(table) ?? [];
    h.rows.set(table, rows);
    if (insertion) {
      if (table === "numo_assistant_turns" && h.beforeReceiptInsert) {
        const race = h.beforeReceiptInsert;
        h.beforeReceiptInsert = null;
        race();
      }
      const duplicate = rows.some(row => table === "conversations"
        ? row.id === insertion!.id
        : row.conversation_id === insertion!.conversation_id && row.request_id === insertion!.request_id);
      if (duplicate) return { data: null, error: { code: "23505" } };
      const inserted = { id: "stopped-receipt", ...insertion };
      rows.push(inserted);
      return { data: [inserted], error: null };
    }
    const matching = rows.filter(row => filters.every(filter => filter(row))).sort((a, b) => {
      for (const { key, ascending } of orders) {
        const difference = String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
        if (difference) return ascending ? difference : -difference;
      }
      return 0;
    }).slice(0, rowLimit);
    if (patch) {
      if (table === "agent_runs" && h.failCascade) return { data: null, error: { message: "network" } };
      matching.forEach(row => Object.assign(row, patch));
    }
    return { data: matching, error: null };
  };
  const builder = {
    select: () => builder,
    order: (key: string, options: { ascending: boolean }) => { orders.push({ key, ...options }); return builder; },
    limit: (limit: number) => { rowLimit = limit; return builder; },
    insert: (value: Record<string, unknown>) => { insertion = value; return builder; },
    update: (value: Record<string, unknown>) => { patch = value; return builder; },
    eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return builder; },
    or: () => { filters.push(row => row.status !== "stopped" || row.model != null || Number(row.attempts) > 0); return builder; },
    in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return builder; },
    is: (key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return builder; },
    single: async () => {
      if (insertion && table === "numo_assistant_turns" && h.receiptInsertGate) await h.receiptInsertGate;
      const result = execute(); return { ...result, data: result.data?.[0] ?? null };
    },
    maybeSingle: async () => {
      if (table === "conversations" && !patch && h.versionReadGate) await h.versionReadGate;
      const result = execute(); return { ...result, data: result.data?.[0] ?? null };
    },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(execute()).then(resolve),
  };
  return builder;
}
const service = { from: query } as unknown as SupabaseClient;
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));
vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({ ok: true, user: { id: "owner" }, supabase: service }),
}));
vi.mock("@/lib/server/session-rate-limit", () => ({
  checkSessionRateLimit: () => ({ allowed: true }),
}));
vi.mock("@/lib/server/numo/turn-intent-content", () => ({
  shouldProtectNumoTurnIntent: () => h.protectIntent(),
  encodeNumoTurnIntent: (...args: Parameters<typeof h.encodeIntent>) => h.encodeIntent(...args),
}));
const { requestNumoRequestStop, stopCanceledNumoMediation } = await import("./turns");
const { ensureNumoRequestConversation } = await import("./request-conversation");
const { POST } = await import("@/app/api/assistant/turns/stop/route");

beforeEach(() => {
  h.rows.clear(); h.failCascade = false; h.operations = [];
  h.versionReadGate = null; h.receiptInsertGate = null; h.beforeReceiptInsert = null;
  h.protectIntent.mockReset(); h.protectIntent.mockResolvedValue(false); h.encodeIntent.mockClear();
});
const identity = { userId: "owner", conversationId: "conversation", requestId: "request" };

describe("Durable Numo request cancellation", () => {
  it("revokes active execution without entering delayed receipt encryption or insertion", async () => {
    h.rows.set("numo_assistant_turns", [{ id: "active",
      conversation_id: "conversation", user_id: "owner", request_id: "request",
      status: "running", claim_token: "claim",
    }]);
    h.protectIntent.mockImplementation(() => new Promise<never>(() => {}));
    h.receiptInsertGate = new Promise(() => {});
    const pending = requestNumoRequestStop(identity);
    await vi.waitFor(() => expect(h.rows.get("numo_assistant_turns")![0])
      .toMatchObject({ status: "stopped", claim_token: null }), { timeout: 100 });
    expect(await pending).toMatchObject({ id: "active", status: "stopped" });
    expect(h.protectIntent).not.toHaveBeenCalled();
    expect(h.encodeIntent).not.toHaveBeenCalled();
    expect(h.operations).not.toContainEqual({ table: "numo_assistant_turns", action: "insert" });
  });

  it("revokes the claim before a delayed conversation projection read completes", async () => {
    let releaseVersion!: () => void;
    h.versionReadGate = new Promise((resolve) => { releaseVersion = resolve; });
    h.rows.set("numo_assistant_turns", [{ id: "active", conversation_id: "conversation",
      user_id: "owner", request_id: "request", status: "running", claim_token: "claim" }]);
    const pending = requestNumoRequestStop(identity);
    try {
      await vi.waitFor(() => expect(h.rows.get("numo_assistant_turns")![0])
        .toMatchObject({ status: "stopped", claim_token: null }), { timeout: 100 });
    } finally {
      releaseVersion();
    }
    expect(await pending).toMatchObject({ status: "stopped" });
  });

  it("retires admission that wins the race with protected receipt insertion", async () => {
    h.protectIntent.mockResolvedValue(true);
    h.beforeReceiptInsert = () => h.rows.get("numo_assistant_turns")!.push({ id: "race-winner",
      conversation_id: "conversation", user_id: "owner", request_id: "request",
      status: "running", claim_token: "late-claim" });
    expect(await requestNumoRequestStop(identity)).toMatchObject({ id: "race-winner", status: "stopped" });
    expect(h.encodeIntent).toHaveBeenCalledWith("owner", "conversation", "request", {});
    expect(h.rows.get("numo_assistant_turns")![0].claim_token).toBeNull();
  });

  it("leaves an already completed exact request unchanged without preparing another receipt", async () => {
    h.rows.set("numo_assistant_turns", [{ id: "completed", conversation_id: "conversation",
      user_id: "owner", request_id: "request", status: "completed" }]);
    expect(await requestNumoRequestStop(identity)).toMatchObject({ status: "completed" });
    expect(h.protectIntent).not.toHaveBeenCalled();
    expect(h.operations).not.toContainEqual({ table: "numo_assistant_turns", action: "insert" });
  });

  it("records a terminal request before its first admission", async () => {
    await ensureNumoRequestConversation({ service, conversationId: identity.conversationId, userId: identity.userId });
    expect(await requestNumoRequestStop(identity)).toMatchObject({ status: "stopped" });
    expect(h.rows.get("numo_assistant_turns")).toEqual([expect.objectContaining({
      conversation_id: "conversation", request_id: "request", user_id: "owner", status: "stopped",
    })]);
    expect(h.rows.get("conversations")![0].title).toBeNull();
  });

  it("reuses a private identity without overwriting its title or settings", async () => {
    h.rows.set("conversations", [{ id: "conversation", user_id: "owner", title: "existing", model: "chosen" }]);
    expect(await ensureNumoRequestConversation({ service, conversationId: "conversation", userId: "owner", title: "replacement" }))
      .toEqual({ created: false });
    expect(h.rows.get("conversations")![0]).toMatchObject({ title: "existing", model: "chosen" });
    await expect(ensureNumoRequestConversation({ service, conversationId: "conversation", userId: "other" }))
      .rejects.toThrow("unavailable");
  });

  it("revokes only the matched execution and cascades its workers and queued inputs", async () => {
    h.rows.set("numo_assistant_turns", [
      { id: "old", conversation_id: "conversation", user_id: "owner", request_id: "request", status: "running", claim_token: "claim", claimed_at: "then" },
      { id: "new", conversation_id: "conversation", user_id: "owner", request_id: "newer-request", status: "running", claim_token: "new-claim" },
    ]);
    h.rows.set("agent_runs", [
      { id: "worker", parent_numo_turn_id: "old", status: "running", interrupt_requested: false },
      { id: "unrelated", parent_numo_turn_id: "new", status: "running", interrupt_requested: false },
    ]);
    h.rows.set("agent_run_messages", [{ run_id: "worker", consumed_at: null }, { run_id: "unrelated", consumed_at: null }]);
    h.rows.set("agent_run_input_requests", [{ parent_numo_turn_id: "old", status: "pending" }]);
    expect(await requestNumoRequestStop(identity)).toEqual({
      id: "old", conversation_id: "conversation", user_id: "owner", request_id: "request", status: "stopped",
      claim_token: null, claimed_at: null, completed_at: expect.any(String), updated_at: expect.any(String), error_message: null,
    });
    expect(h.rows.get("numo_assistant_turns")![1]).toMatchObject({ status: "running", claim_token: "new-claim" });
    expect(h.rows.get("agent_runs")!.map(row => row.interrupt_requested)).toEqual([true, false]);
    expect(h.rows.get("agent_run_messages")!.map(row => Boolean(row.consumed_at))).toEqual([true, false]);
    expect(h.rows.get("agent_run_input_requests")![0].status).toBe("canceled");
  });

  it("does not acknowledge a failed cascade and allows its receipt to be retried", async () => {
    h.rows.set("numo_assistant_turns", [{ id: "turn", conversation_id: "conversation", user_id: "owner", request_id: "request", status: "running" }]);
    h.rows.set("agent_runs", [{ id: "worker", parent_numo_turn_id: "turn", status: "running", interrupt_requested: false }]);
    h.failCascade = true;
    await expect(requestNumoRequestStop(identity)).rejects.toThrow("stop Numo workers");
    h.failCascade = false;
    expect(await requestNumoRequestStop(identity)).toMatchObject({ status: "stopped" });
    expect(h.rows.get("agent_runs")![0].interrupt_requested).toBe(true);
  });

  it("clears the stopped conversation projection while preserving a newer generation", async () => {
    h.rows.set("conversations", [{ id: "conversation", user_id: "owner", status: "generating", updated_at: "version-1" }]);
    h.rows.set("numo_assistant_turns", [{ id: "old", conversation_id: "conversation", user_id: "owner",
      request_id: "request", status: "running", model: "model", created_at: "2026-10-01T10:00:00Z" }]);
    await requestNumoRequestStop(identity);
    expect(h.rows.get("conversations")![0].status).toBe("idle");
    h.rows.get("conversations")![0].status = "generating";
    h.rows.get("conversations")![0].updated_at = "version-2";
    h.rows.get("numo_assistant_turns")!.push({ id: "new", conversation_id: "conversation", user_id: "owner",
      request_id: "newer-request", status: "running", created_at: "2026-10-01T10:01:00Z" });
    await requestNumoRequestStop(identity);
    expect(h.rows.get("conversations")![0]).toMatchObject({ status: "generating", updated_at: "version-2" });
  });

  it("accepts a prospective identity before chat admission through the authenticated route", async () => {
    const response = await POST(new Request("http://localhost/api/assistant/turns/stop", {
      method: "POST", body: JSON.stringify({
        requestId: "61000000-0000-4000-8000-000000000001",
        conversationId: "61000000-0000-4000-8000-000000000002", newConversation: true,
      }),
    }) as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "stopped" });
    expect(h.rows.get("conversations")![0].user_id).toBe("owner");
  });

  it("uses an authorized turn hint without recreating its prospective conversation", async () => {
    const conversationId = "61000000-0000-4000-8000-000000000002";
    const requestId = "61000000-0000-4000-8000-000000000001";
    const turnId = "61000000-0000-4000-8000-000000000003";
    h.rows.set("conversations", [{ id: conversationId, user_id: "owner" }]);
    h.rows.set("numo_assistant_turns", [{ id: turnId, conversation_id: conversationId,
      user_id: "owner", request_id: requestId, status: "running", claim_token: "claim" }]);
    const response = await POST(new Request("http://localhost/api/assistant/turns/stop", {
      method: "POST", body: JSON.stringify({ requestId, conversationId, turnId, newConversation: true }),
    }) as never);
    expect(response.status).toBe(200);
    expect(h.operations).not.toContainEqual({ table: "conversations", action: "insert" });
    expect(h.protectIntent).not.toHaveBeenCalled();
  });

  it("revokes the mediated parent while its submission receipt encryption is still pending", async () => {
    const conversationId = "61000000-0000-4000-8000-000000000002";
    const turnId = "61000000-0000-4000-8000-000000000003";
    const requestId = "61000000-0000-4000-8000-000000000004";
    h.rows.set("conversations", [{ id: conversationId, user_id: "owner" }]);
    h.rows.set("numo_assistant_turns", [{ id: turnId, conversation_id: conversationId,
      user_id: "owner", request_id: "parent-request", status: "waiting_work", claim_token: "claim" }]);
    let releaseReceipt!: (protect: boolean) => void;
    h.protectIntent.mockImplementation(() => new Promise((resolve) => { releaseReceipt = resolve; }));
    const pending = POST(new Request("http://localhost/api/assistant/turns/stop", {
      method: "POST", body: JSON.stringify({ requestId, conversationId, turnId }),
    }) as never);
    try {
      await vi.waitFor(() => {
        expect(h.rows.get("numo_assistant_turns")![0]).toMatchObject({ status: "stopped", claim_token: null });
        expect(h.protectIntent).toHaveBeenCalledOnce();
      }, { timeout: 100 });
    } finally {
      releaseReceipt?.(false);
    }
    expect((await pending).status).toBe(200);
    expect(h.rows.get("numo_assistant_turns")!.find(row => row.request_id === requestId)).toMatchObject({ status: "stopped" });
  });

  it("refuses a Stop for another user's conversation before recording a receipt", async () => {
    const conversationId = "61000000-0000-4000-8000-000000000002";
    h.rows.set("conversations", [{ id: conversationId, user_id: "other" }]);
    const response = await POST(new Request("http://localhost/api/assistant/turns/stop", {
      method: "POST", body: JSON.stringify({
        requestId: "61000000-0000-4000-8000-000000000001", conversationId,
      }),
    }) as never);
    expect(response.status).toBe(404);
    expect(h.rows.get("numo_assistant_turns")).toBeUndefined();
  });

  it("stops the actual delegated parent after a steering submission while retaining its admission receipt", async () => {
    const conversationId = "61000000-0000-4000-8000-000000000002";
    const turnId = "61000000-0000-4000-8000-000000000003";
    const submissionRequestId = "61000000-0000-4000-8000-000000000004";
    const parentRequestId = "61000000-0000-4000-8000-000000000005";
    h.rows.set("conversations", [{ id: conversationId, user_id: "owner" }]);
    h.rows.set("numo_assistant_turns", [{ id: turnId, conversation_id: conversationId,
      user_id: "owner", request_id: parentRequestId, status: "waiting_work", model: "model", attempts: 1 }]);
    h.rows.set("agent_runs", [{ id: "worker", parent_numo_turn_id: turnId,
      status: "running", interrupt_requested: false }]);
    h.rows.set("agent_run_messages", [{ run_id: "worker", consumed_at: null }]);
    const response = await POST(new Request("http://localhost/api/assistant/turns/stop", {
      method: "POST", body: JSON.stringify({ requestId: submissionRequestId, conversationId, turnId }),
    }) as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ turn_id: turnId, status: "stopped" });
    expect(h.rows.get("numo_assistant_turns")!.find(row => row.request_id === submissionRequestId))
      .toMatchObject({ status: "stopped" });
    expect(h.rows.get("numo_assistant_turns")!.find(row => row.id === turnId))
      .toMatchObject({ status: "stopped", claim_token: null });
    expect(h.rows.get("agent_runs")![0].interrupt_requested).toBe(true);
    expect(h.rows.get("agent_run_messages")![0].consumed_at).toEqual(expect.any(String));
  });

  it("refuses a turn hint outside the authorized conversation before writing a submission receipt", async () => {
    const conversationId = "61000000-0000-4000-8000-000000000002";
    const turnId = "61000000-0000-4000-8000-000000000003";
    h.rows.set("conversations", [{ id: conversationId, user_id: "owner" }]);
    h.rows.set("numo_assistant_turns", [{ id: turnId, conversation_id: "other-conversation",
      user_id: "owner", request_id: "other-request", status: "running" }]);
    const response = await POST(new Request("http://localhost/api/assistant/turns/stop", {
      method: "POST", body: JSON.stringify({
        requestId: "61000000-0000-4000-8000-000000000004", conversationId, turnId,
      }),
    }) as never);
    expect(response.status).toBe(404);
    expect(h.rows.get("numo_assistant_turns")).toHaveLength(1);
    expect(h.rows.get("numo_assistant_turns")![0].status).toBe("running");
  });

  it("finds the delegated parent from its persisted submission when response headers have not arrived", async () => {
    const conversationId = "61000000-0000-4000-8000-000000000002";
    const submissionRequestId = "61000000-0000-4000-8000-000000000004";
    h.rows.set("conversations", [{ id: conversationId, user_id: "owner" }]);
    h.rows.set("numo_assistant_turns", [{ id: "parent", conversation_id: conversationId,
      user_id: "owner", request_id: "parent-request", status: "waiting_work", model: "model", attempts: 1 }]);
    h.rows.set("assistant_messages", [{ id: submissionRequestId, conversation_id: conversationId, role: "user", turn_id: "parent" }]);
    h.rows.set("agent_runs", [{ id: "worker", parent_numo_turn_id: "parent", status: "running", interrupt_requested: false }]);
    const response = await POST(new Request("http://localhost/api/assistant/turns/stop", {
      method: "POST", body: JSON.stringify({ requestId: submissionRequestId, conversationId }),
    }) as never);
    expect(await response.json()).toMatchObject({ turn_id: "parent", status: "stopped" });
    expect(h.rows.get("agent_runs")![0].interrupt_requested).toBe(true);
  });

  it("finishes cancellation when a worker submission commits after its Stop receipt", async () => {
    h.rows.set("numo_assistant_turns", [
      { id: "parent", conversation_id: "conversation", user_id: "owner", request_id: "parent-request", status: "waiting_work", model: "model", attempts: 1 },
      { id: "receipt", conversation_id: "conversation", user_id: "owner", request_id: "request", status: "stopped" },
    ]);
    h.rows.set("agent_runs", [{ id: "worker", parent_numo_turn_id: "parent", status: "running", interrupt_requested: false }]);
    expect(await stopCanceledNumoMediation({ ...identity, parentTurnId: "parent" }))
      .toMatchObject({ id: "parent", status: "stopped" });
    expect(h.rows.get("agent_runs")![0].interrupt_requested).toBe(true);
  });
});
