import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  rpcError: null as { code: string; message: string } | null,
  failAt: "", parentActive: true,
  parentStopped: false, interrupted: false, steeringDiscarded: false,
  calls: [] as Array<{ table: string; patch?: Record<string, unknown>; filters: Record<string, unknown> }>,
}));
const rpc = vi.fn(async () => ({ data: "turn-1", error: h.rpcError }));
const signal = vi.fn();
vi.mock("@/lib/server/numo/turns", () => ({ signalNumoTurnStopInProcess: signal }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ rpc, from(table: string) {
  const call = { table, filters: {} as Record<string, unknown>, patch: undefined as Record<string, unknown> | undefined };
  const q = {
    select: () => q, update(patch: Record<string, unknown>) { call.patch = patch; return q; },
    eq(key: string, value: unknown) { call.filters[key] = value; return q; },
    in(key: string, value: unknown) { call.filters[key] = value; return q; },
    is(key: string, value: unknown) { call.filters[key] = value; return q; },
    maybeSingle: async () => result(),
    then(resolve: (value: unknown) => unknown) { return Promise.resolve(result()).then(resolve); },
  };
  function result() {
    h.calls.push(call);
    if (h.failAt === `${table}:${call.patch ? "write" : "read"}`) return { data: null, error: { message: "unavailable" } };
    if (!call.patch) return { data: table === "agent_runs"
      ? { parent_numo_turn_id: "turn-1", parent_numo_conversation_id: "conversation-1" }
      : { updated_at: "old-timestamp" }, error: null };
    if (table === "numo_assistant_turns") { h.parentStopped = true; return { data: h.parentActive ? { id: "turn-1" } : null, error: null }; }
    if (table === "agent_run_messages") h.steeringDiscarded = true;
    if (table === "agent_runs") {
      expect(h.parentStopped).toBe(true); expect(h.steeringDiscarded).toBe(true);
      h.interrupted = true;
    }
    return { data: null, error: null };
  }
  return q;
} }) }));
vi.mock("@/lib/server/notifications", () => ({ insertNotifications: vi.fn() }));
vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/server/automations/hooks", () => ({ notifyChainOfRunEnd: vi.fn() }));
vi.mock("@/lib/server/routine-hooks", () => ({ notifyRoutineOfRunEnd: vi.fn(), stampRoutineRunEnd: vi.fn() }));
vi.mock("@/lib/server/after-safe", () => ({ afterOrNow: vi.fn() }));
vi.mock("./live", () => ({ broadcastRunEvent: vi.fn() }));
const { requestNumoWorkerStop } = await import("./runs");

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(h, { rpcError: null, failAt: "", parentActive: true, parentStopped: false,
    interrupted: false, steeringDiscarded: false, calls: [] });
});
describe("Numo worker Stop schema compatibility", () => {
  it("prefers the atomic RPC and signals the local execution", async () => {
    await requestNumoWorkerStop("worker-1");
    expect(rpc).toHaveBeenCalledWith("request_numo_worker_stop", { p_run_id: "worker-1" });
    expect(h.calls).toEqual([]); expect(signal).toHaveBeenCalledWith("turn-1");
  });
  it("revokes continuation before scoped interruption when the RPC is absent", async () => {
    h.rpcError = { code: "PGRST202", message: "missing function" };
    await requestNumoWorkerStop("worker-1");
    expect(h.interrupted).toBe(true);
    const updates = h.calls.filter(c => c.patch);
    expect(updates[0]).toMatchObject({ table: "numo_assistant_turns", filters: { id: "turn-1" },
      patch: { status: "stopped", claim_token: null, claimed_at: null } });
    for (const table of ["agent_runs", "agent_run_messages", "agent_run_input_requests"]) {
      expect(updates.find(c => c.table === table)?.filters).toMatchObject(
        table === "agent_runs" ? { id: "worker-1", status: ["queued", "running"] } : { run_id: "worker-1" });
    }
    expect(updates.at(-1)).toMatchObject({ table: "conversations",
      filters: { id: "conversation-1", updated_at: "old-timestamp" } });
    expect(signal).toHaveBeenCalledWith("turn-1");
  });
  it("can retry cleanup after its parent has already retired without idling a newer turn", async () => {
    h.rpcError = { code: "PGRST202", message: "missing function" }; h.parentActive = false;
    await requestNumoWorkerStop("worker-1");
    expect(h.interrupted).toBe(true);
    expect(h.calls.some(c => c.table === "conversations" && c.patch)).toBe(false);
  });
  it.each(["42501", "PGRST301", "XX000"])("never falls back for RPC error %s", async code => {
    h.rpcError = { code, message: "unavailable" };
    await expect(requestNumoWorkerStop("worker-1")).rejects.toThrow("unavailable");
    expect(h.calls).toEqual([]); expect(signal).not.toHaveBeenCalled();
  });
  it.each(["agent_runs:read", "conversations:read", "numo_assistant_turns:write", "agent_run_messages:write",
    "agent_run_input_requests:write", "agent_runs:write", "conversations:write"])("reports compatibility failure at %s", async failAt => {
    h.rpcError = { code: "PGRST202", message: "missing function" }; h.failAt = failAt;
    await expect(requestNumoWorkerStop("worker-1")).rejects.toThrow();
    expect(signal).not.toHaveBeenCalled();
    if (failAt === "numo_assistant_turns:write") expect(h.interrupted).toBe(false);
  });
});
