import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  run: {} as Record<string, unknown>, authority: vi.fn(), renew: vi.fn(), finalize: vi.fn(), release: vi.fn(),
  landed: vi.fn(), stamped: vi.fn(), claimed: vi.fn(), sandbox: { name: "agent-fixture" },
}));
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess: async () => ({ isMember: true }) }));
vi.mock("./runs", () => ({
  getRun: async () => h.run, runRepoBindingIsCurrent: async () => true,
  stampRunResult: h.stamped, claimRunRest: h.claimed,
  appendEvent: vi.fn(), appendRunJournal: vi.fn(), clearInterrupt: vi.fn(),
  hasPendingRunMessages: vi.fn(), pullPendingMessages: vi.fn(), readInterruptFlag: vi.fn(), requeueRunMessage: vi.fn(),
  releaseRunInlineComment: vi.fn(), reserveRunInlineComment: vi.fn(), stampRun: vi.fn(),
}));
vi.mock("./native-worker-connections", () => ({ assertNativeWorkerAuthority: h.authority,
  renewNativeWorkerConnection: h.renew, finalizeNativeWorkerConnection: h.finalize, releaseNativeWorkerConnection: h.release }));
vi.mock("./sandbox", () => ({ getAgentSandboxByName: async () => h.sandbox }));
vi.mock("./vm-rest", () => ({ landVmTurn: h.landed }));

import { handleControlPlaneRequest, validNativeWorkerCheckpoint } from "./control-plane";

const checkpoint = () => ({ messages: [], native: { engine: "codex", history: [{ role: "user", text: "Continue the fixture" }] } });
const request = (surface: string, body: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  handleControlPlaneRequest({ runId: "run-fixture", sandboxName: h.sandbox.name, method: "POST", surface, body, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  h.run = { id: "run-fixture", created_by: "owner", project_id: "project", status: "running",
    agent_engine: "codex", key_mode: "subscription", sandbox_id: h.sandbox.name };
  h.authority.mockResolvedValue({ engine: "codex" });
  h.renew.mockResolvedValue(undefined); h.finalize.mockResolvedValue(undefined); h.release.mockResolvedValue(undefined);
  h.claimed.mockResolvedValue(h.run); h.stamped.mockResolvedValue({ run: h.run, failed: false });
  h.landed.mockResolvedValue(undefined);
});

describe("native worker control-plane authority", () => {
  it("rejects changed connection authority before any privileged surface", async () => {
    h.authority.mockRejectedValue(new Error("revoked"));
    expect((await request("/heartbeat")).status).toBe(409);
    expect(h.stamped).not.toHaveBeenCalled(); expect(h.renew).not.toHaveBeenCalled();
  });
  it("rejects missing sandbox identity and API inference or journal surfaces", async () => {
    expect((await request("/heartbeat", {}, { sandboxName: undefined })).status).toBe(403);
    for (const surface of ["/usage", "/llm-key", "/journal"]) expect((await request(surface)).status).toBe(403);
    expect(h.finalize).not.toHaveBeenCalled();
  });
  it("renews the fenced native lease before acknowledging a heartbeat", async () => {
    expect((await request("/heartbeat")).status).toBe(200);
    expect(h.renew).toHaveBeenCalledWith("run-fixture", "agent-fixture");
    expect(h.renew.mock.invocationCallOrder[0]).toBeLessThan(h.stamped.mock.invocationCallOrder[0]);
    expect(h.stamped.mock.calls[0][2]).toEqual({ expected: { sandbox_reap_claim: null } });
  });
  it("rejects an in-flight heartbeat or checkpoint after a watchdog claims recovery", async () => {
    h.stamped.mockResolvedValue({ run: null, failed: false });
    expect((await request("/heartbeat")).status).toBe(409);
    expect((await request("/checkpoint", { checkpoint: checkpoint() }, { method: "PUT" })).status).toBe(409);
    for (const call of h.stamped.mock.calls) {
      expect(call[2]).toEqual({ expected: { sandbox_reap_claim: null } });
    }
  });
  it("saves an SDK export before landing and releases only through verified cleanup", async () => {
    expect((await request("/rest", { status: "completed", nativeAuthExportReady: true, costUsd: 0, checkpoint: checkpoint() })).status).toBe(200);
    expect(h.finalize).toHaveBeenCalledWith("run-fixture", h.sandbox);
    expect(h.finalize.mock.invocationCallOrder[0]).toBeLessThan(h.landed.mock.invocationCallOrder[0]);
    expect(h.landed.mock.invocationCallOrder[0]).toBeLessThan(h.release.mock.invocationCallOrder[0]);
  });
  it("fails closed on an ambiguous auth export without retaining unverified memory", async () => {
    h.finalize.mockRejectedValue(new Error("SDK export unavailable"));
    await request("/rest", { status: "completed", nativeAuthExportReady: true, costUsd: 0, checkpoint: checkpoint() });
    expect(h.landed).toHaveBeenCalledWith(h.run, expect.objectContaining({ status: "error", costUsd: 0,
      errorMessage: "Native subscription reconnection required" }));
    expect(h.landed.mock.calls[0][1].checkpoint).toBeUndefined();
    expect(h.release).toHaveBeenCalled();
  });
  it("never charges native reported inference and cleans up if landing fails", async () => {
    await request("/rest", { status: "completed", nativeAuthExportReady: true, costUsd: 2 });
    expect(h.finalize).not.toHaveBeenCalled(); expect(h.landed.mock.calls[0][1].costUsd).toBe(0);
    h.landed.mockRejectedValue(new Error("landing failed"));
    await expect(request("/rest", { status: "completed", nativeAuthExportReady: true, costUsd: 0 })).rejects.toThrow("landing failed");
    expect(h.release).toHaveBeenCalledTimes(2);
  });
  it("accepts portable text and rejects mixed, oversized or credential-bearing state", () => {
    expect(validNativeWorkerCheckpoint(checkpoint() as never, "codex")).toBe(true);
    expect(validNativeWorkerCheckpoint(checkpoint() as never, "claude_code")).toBe(false);
    expect(validNativeWorkerCheckpoint({ ...checkpoint(), opencode: { sessionId: "opaque" } } as never, "codex")).toBe(false);
    const poisoned = checkpoint(); Object.assign(poisoned.native.history[0], { refresh_token: "synthetic" });
    expect(validNativeWorkerCheckpoint(poisoned as never, "codex")).toBe(false);
    expect(validNativeWorkerCheckpoint({ ...checkpoint(), native: { engine: "codex", history: [{ role: "user", text: "x".repeat(1_000_001) }] } } as never, "codex")).toBe(false);
  });
});
