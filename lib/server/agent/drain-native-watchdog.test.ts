import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const h = vi.hoisted(() => ({
  row: {} as Record<string, unknown>, alive: vi.fn(), rpc: vi.fn(),
  lease: vi.fn(), abort: vi.fn(), stamp: vi.fn(), event: vi.fn(),
  usage: vi.fn(), notify: vi.fn(),
}));
vi.mock("./native-worker-connections", () => ({
  abortNativeWorkerConnection: h.abort, getNativeWorkerCleanupLease: h.lease,
  releaseNativeWorkerConnection: vi.fn(),
}));
vi.mock("./runs", () => ({ appendEvent: h.event, claimRun: vi.fn(), notifyAgentRun: h.notify, stampRun: h.stamp }));
vi.mock("./sandbox", () => ({ isLoopCommandAlive: h.alive, stopSandboxByName: vi.fn() }));
vi.mock("./execute", () => ({ executeAgentRun: vi.fn() }));
vi.mock("./sandbox-allocation", () => ({ retryRevokedSandboxAllocations: vi.fn() }));
vi.mock("./pr-landing", () => ({ SANDBOX_USAGE_SEQ_BASE: 1000 }));
vi.mock("./run-key", () => ({ revokeRunKey: vi.fn() }));
vi.mock("@/lib/server/usage", () => ({ recordSandboxUsage: h.usage }));
vi.mock("@/lib/server/ai-usage", () => ({ spentFromLedger: async () => null }));
vi.mock("./deployment", () => ({ currentDeploymentScope: () => null }));
vi.mock("./run-deployment-content", () => ({ deploymentLookupPrefix: vi.fn() }));
vi.mock("@/lib/server/encryption/local-key-wrapper", () => ({ hasDataRootKey: () => false }));

const { reapDeadVmRuns } = await import("./drain");
const CLAIM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const lease = { leaseId: "stop-lease", workerAllocationId: "old-allocation", generation: 7 };
function service(): SupabaseClient {
  const query = {
    select: () => query, eq: () => query, lt: () => query,
    limit: async () => ({ data: [structuredClone(h.row)] }),
  };
  return { from: () => query, rpc: h.rpc } as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.resetAllMocks();
  const old = new Date(Date.now() - 30 * 60_000).toISOString();
  h.row = { id: "run", agent_engine: "codex", sandbox_id: "old-sandbox",
    loop_command_id: "old-command", local_exec: false, created_by: "owner",
    project_id: "project", conversation_id: "conversation", continuations: 0,
    started_at: old, last_activity_at: old, cost_usd: 0,
    sandbox_reap_claim: null,
  };
  h.alive.mockResolvedValue(null);
  h.rpc.mockResolvedValue({ data: CLAIM, error: null });
  h.lease.mockResolvedValue(lease);
  h.abort.mockResolvedValue(undefined);
  h.stamp.mockResolvedValue({ id: "run", status: "failed" });
  h.event.mockResolvedValue(undefined);
  h.usage.mockResolvedValue(undefined);
  h.notify.mockResolvedValue(undefined);
});

describe("native watchdog recovery fencing", () => {
  it("does not invalidate or stop a native worker when the atomic snapshot claim is lost", async () => {
    h.rpc.mockResolvedValue({ data: null, error: null });
    await expect(reapDeadVmRuns(service())).resolves.toEqual({ reaped: 0 });
    expect(h.rpc).toHaveBeenCalledWith("claim_native_worker_recovery", expect.objectContaining({
      p_run_id: "run", p_started_at: h.row.started_at, p_last_activity_at: h.row.last_activity_at,
      p_loop_command_id: "old-command", p_sandbox_name: "old-sandbox",
    }));
    expect(h.lease).not.toHaveBeenCalled();
    expect(h.abort).not.toHaveBeenCalled();
    expect(h.stamp).not.toHaveBeenCalled();
    expect(h.usage).not.toHaveBeenCalled();
  });

  it("claims recovery before physical cleanup and publishes failure only afterward", async () => {
    await expect(reapDeadVmRuns(service())).resolves.toEqual({ reaped: 1 });
    expect(h.rpc.mock.invocationCallOrder[0]).toBeLessThan(h.lease.mock.invocationCallOrder[0]);
    expect(h.lease).toHaveBeenCalledWith("run", "old-sandbox");
    expect(h.abort).toHaveBeenCalledWith("run", lease);
    expect(h.abort.mock.invocationCallOrder[0]).toBeLessThan(h.stamp.mock.invocationCallOrder[0]);
    expect(h.stamp).toHaveBeenCalledWith("run", expect.objectContaining({
      status: "failed", sandbox_reap_claim: null, sandbox_reap_claimed_at: null,
    }), { expected: expect.objectContaining({ sandbox_reap_claim: CLAIM,
      sandbox_id: "old-sandbox", loop_command_id: "old-command", last_activity_at: h.row.last_activity_at }) });
    expect(h.stamp.mock.invocationCallOrder[0]).toBeLessThan(h.event.mock.invocationCallOrder[0]);
  });

  it("keeps recovery pending when physical cleanup is uncertain", async () => {
    h.abort.mockRejectedValue(new Error("Provider stop is uncertain"));
    await expect(reapDeadVmRuns(service())).rejects.toThrow("Provider stop is uncertain");
    expect(h.stamp).not.toHaveBeenCalled();
    expect(h.event).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("retries a durable recovery even when the revoked process still appears alive", async () => {
    h.row.sandbox_reap_claim = CLAIM;
    h.alive.mockResolvedValue(true);
    await expect(reapDeadVmRuns(service())).resolves.toEqual({ reaped: 1 });
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.abort).toHaveBeenCalledTimes(1);
    expect(h.stamp).toHaveBeenCalledWith("run", expect.anything(), { expected: expect.objectContaining({ sandbox_reap_claim: CLAIM }) });
  });

  it("does not touch a replacement allocation when cleanup authority no longer matches the snapshot", async () => {
    h.lease.mockResolvedValue(null);
    await expect(reapDeadVmRuns(service())).resolves.toEqual({ reaped: 1 });
    expect(h.lease).toHaveBeenCalledWith("run", "old-sandbox");
    expect(h.abort).not.toHaveBeenCalled();
  });

  it("retries the terminal stamp after another sweeper already completed physical cleanup", async () => {
    h.row.sandbox_reap_claim = CLAIM;
    h.lease.mockResolvedValue(null);
    await expect(reapDeadVmRuns(service())).resolves.toEqual({ reaped: 1 });
    expect(h.stamp).toHaveBeenCalledTimes(1);
    expect(h.usage).toHaveBeenCalledTimes(1);
  });

  it("fails closed before cleanup if the recovery claim database operation fails", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "Database unavailable" } });
    await expect(reapDeadVmRuns(service())).rejects.toThrow("Unable to claim native worker recovery");
    expect(h.abort).not.toHaveBeenCalled();
    expect(h.stamp).not.toHaveBeenCalled();
  });

  it("leaves a live unclaimed native worker alone", async () => {
    h.alive.mockResolvedValue(true);
    await expect(reapDeadVmRuns(service())).resolves.toEqual({ reaped: 0 });
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.abort).not.toHaveBeenCalled();
  });

  it("leaves a claimed recovery retryable when its terminal stamp does not land", async () => {
    h.stamp.mockResolvedValue(null);
    await expect(reapDeadVmRuns(service())).resolves.toEqual({ reaped: 0 });
    expect(h.abort).toHaveBeenCalledTimes(1);
    expect(h.event).not.toHaveBeenCalled();
    expect(h.usage).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("preserves the existing OpenCode watchdog path without native claims", async () => {
    h.row.agent_engine = "opencode";
    await expect(reapDeadVmRuns(service())).resolves.toEqual({ reaped: 1 });
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.lease).not.toHaveBeenCalled();
    expect(h.abort).not.toHaveBeenCalled();
    expect(h.stamp).toHaveBeenCalledWith("run", expect.objectContaining({ status: "failed" }), {
      expected: {
        started_at: h.row.started_at, last_activity_at: h.row.last_activity_at,
        loop_command_id: "old-command", sandbox_id: "old-sandbox",
      },
    });
  });

});
