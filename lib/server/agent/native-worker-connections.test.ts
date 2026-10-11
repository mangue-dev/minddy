import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NativeConnectionLease } from "./native-agent-credentials";
import type { AgentSandbox } from "./sandbox";
import { nativeWorkerPaths } from "@/lib/native-agent-worker";
import { cloudLayout } from "./harness-layout";

const h = vi.hoisted(() => ({
  lease: null as NativeConnectionLease | null, runtime: null as Record<string, unknown> | null,
  acquire: vi.fn(), bind: vi.fn(), get: vi.fn(), load: vi.fn(), save: vi.fn(), runtimeGet: vi.fn(),
  runtimeSet: vi.fn(), renew: vi.fn(), release: vi.fn(), disconnect: vi.fn(),
  cleanup: vi.fn(), rpc: vi.fn(), maybeSingle: vi.fn(), write: vi.fn(), read: vi.fn(),
  mkdir: vi.fn(), command: vi.fn(), stopLease: vi.fn(),
}));
vi.mock("./native-agent-credentials", async (original) => ({
  ...(await original<typeof import("./native-agent-credentials")>()),
  acquireNativeWorkerConnection: h.acquire, bindNativeWorkerConnection: h.bind,
  getNativeWorkerConnection: h.get, getNativeRuntime: h.runtimeGet, setNativeRuntime: h.runtimeSet,
  loadNativeProfile: h.load, commitNativeWorkerProfile: h.save, renewNativeWorkerLease: h.renew,
  releaseNativeConnection: h.release, disconnectNativeConnection: h.disconnect,
  stopNativeWorkerLease: h.stopLease,
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ rpc: h.rpc }) }));
vi.mock("./sandbox-allocation", () => ({ cleanupSandboxAllocation: h.cleanup }));
const { claimNativeWorkerConnection, bindNativeWorkerAllocation, restoreNativeWorkerProfile,
  assertNativeWorkerAuthority, renewNativeWorkerConnection, finalizeNativeWorkerConnection,
  releaseNativeWorkerConnection, abortNativeWorkerConnection, getNativeWorkerCleanupLease } = await import("./native-worker-connections");
const profile = { version: 1, engine: "codex", files: [{ path: "auth.json", content: '{"tokens":{"access_token":"private-access","refresh_token":"private-refresh"}}' }] };
const allocation = { id: "allocation", sandbox_name: "sandbox", provider_pending: false, provider_key_id: null, state: "attached" as const };
const sandbox = (): AgentSandbox => ({ name: "sandbox", writeFiles: h.write, readFileToBuffer: h.read,
  mkDir: h.mkdir, runCommand: h.command } as unknown as AgentSandbox);

beforeEach(() => {
  vi.resetAllMocks();
  h.lease = { connectionId: "connection", userId: "owner", engine: "codex", generation: 1,
    leaseId: "lease", revision: 3, kind: "worker", leaseExpiresAt: "2030-01-01", workerRunId: "run", workerAllocationId: "allocation" };
  h.runtime = { kind: "worker", runId: "run", allocationId: "allocation", sandboxName: "sandbox", profileImported: false, profileSaved: false };
  h.acquire.mockResolvedValue(h.lease);
  h.get.mockImplementation(async () => h.lease);
  h.load.mockResolvedValue(profile);
  h.runtimeGet.mockImplementation(async () => structuredClone(h.runtime));
  h.save.mockImplementation(async (_lease, _profile, value) => { h.runtime = structuredClone(value); h.lease!.revision++; });
  h.runtimeSet.mockImplementation(async (_lease, value) => { h.runtime = structuredClone(value); });
  h.rpc.mockReturnValue({ maybeSingle: h.maybeSingle });
  h.maybeSingle.mockResolvedValue({ data: allocation, error: null });
  h.read.mockResolvedValue(Buffer.from(JSON.stringify(profile)));
  h.command.mockResolvedValue({ exitCode: 0 });
  h.stopLease.mockImplementation(async (lease) => ({ ...lease, kind: "stop", leaseId: "stop" }));
  h.disconnect.mockImplementation(async () => ({ lease: { ...h.lease!, kind: "stop", generation: 2, leaseId: "stop" } }));
});

describe("hosted native worker credential lifecycle", () => {
  it("queues a busy profile without credentials, allocation or fallback", async () => {
    h.acquire.mockResolvedValue(null);
    await expect(claimNativeWorkerConnection("run")).resolves.toBeNull();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.load).not.toHaveBeenCalled();
    expect(h.write).not.toHaveBeenCalled();
  });

  it("binds the durable allocation before injection and writes secrets only through SDK private files", async () => {
    await bindNativeWorkerAllocation(h.lease!, allocation);
    expect(h.bind).toHaveBeenCalledWith(h.lease, "allocation");
    // The SDK refuses existing directories; trusted command setup must be idempotent.
    h.mkdir.mockRejectedValue(new Error("Directory already exists"));
    await restoreNativeWorkerProfile(h.lease!, sandbox());
    expect(h.get).toHaveBeenCalledWith("run", "sandbox");
    expect(h.runtimeGet).toHaveBeenCalledWith(h.lease, { execution: true });
    expect(h.runtime?.profileImported).toBe(true);
    expect(h.write).toHaveBeenCalledWith([{ path: nativeWorkerPaths(cloudLayout()).profileImportPath, content: JSON.stringify(profile) }]);
    expect(h.mkdir).not.toHaveBeenCalled();
    expect(h.command).toHaveBeenCalledWith({ cmd: "mkdir", args: ["-p", "--", cloudLayout().harnessDir, nativeWorkerPaths(cloudLayout()).privateRoot] });
    expect(h.command).toHaveBeenCalledWith({ cmd: "chmod", args: ["0700", "--", nativeWorkerPaths(cloudLayout()).privateRoot] });
    expect(h.command).toHaveBeenCalledWith({ cmd: "chmod", args: ["0600", "--", nativeWorkerPaths(cloudLayout()).profileImportPath] });
    expect(h.runtimeSet.mock.invocationCallOrder.at(-1)).toBeLessThan(h.write.mock.invocationCallOrder[0]);
    expect(JSON.stringify(h.runtime)).not.toContain("private-access");
  });

  it("rejects a superseded connection before credentials leave the server", async () => {
    const stale = { ...h.lease! };
    h.lease!.leaseId = "replacement";
    await expect(restoreNativeWorkerProfile(stale, sandbox())).rejects.toThrow("superseded");
    expect(h.load).not.toHaveBeenCalled();
    expect(h.write).not.toHaveBeenCalled();
  });

  it("rechecks live allocation authority and renews without writing profile data", async () => {
    await renewNativeWorkerConnection("run", "sandbox");
    expect(h.renew).toHaveBeenCalledWith(h.lease);
    h.get.mockResolvedValue(null);
    await expect(assertNativeWorkerAuthority("run", "other-sandbox")).rejects.toThrow("unavailable");
    expect(h.save).not.toHaveBeenCalled();
  });

  it("saves the stopped native child's SDK export before releasing compute and credential authority", async () => {
    h.runtime!.profileImported = true;
    await finalizeNativeWorkerConnection("run", sandbox());
    expect(h.read).toHaveBeenCalledWith({ path: nativeWorkerPaths(cloudLayout()).profileExportPath });
    expect(h.save).toHaveBeenCalledWith(h.lease, profile, expect.objectContaining({ profileImported: true, profileSaved: true }));
    expect(h.cleanup).not.toHaveBeenCalled();
    await releaseNativeWorkerConnection("run", { stopped: true });
    expect(h.save.mock.invocationCallOrder[0]).toBeLessThan(h.cleanup.mock.invocationCallOrder[0]);
    expect(h.cleanup.mock.invocationCallOrder[0]).toBeLessThan(h.release.mock.invocationCallOrder[0]);
    expect(h.disconnect).not.toHaveBeenCalled();
  });

  it("rejects corrupt, oversized or provider-swapped SDK exports before vault writes", async () => {
    h.runtime!.profileImported = true;
    for (const data of ["not-json", "x".repeat(65537), JSON.stringify({ ...profile, engine: "claude_code" })]) {
      h.read.mockResolvedValue(Buffer.from(data));
      await expect(finalizeNativeWorkerConnection("run", sandbox())).rejects.toThrow();
    }
    expect(h.save).not.toHaveBeenCalled();
    expect(h.release).not.toHaveBeenCalled();
  });

  it("preserves an atomically saved rotation when the commit response is lost and teardown needs a retry", async () => {
    const captured = { ...h.lease! };
    h.runtime!.profileImported = true;
    h.save.mockImplementation(async (_lease, _profile, value) => {
      h.runtime = structuredClone(value); h.lease!.revision++;
      throw new Error("Commit response lost");
    });
    await expect(finalizeNativeWorkerConnection("run", sandbox())).rejects.toThrow("Commit response lost");
    h.cleanup.mockRejectedValueOnce(new Error("Provider temporarily unavailable"));
    await expect(abortNativeWorkerConnection("run", captured)).rejects.toThrow("temporarily unavailable");
    expect(h.disconnect).not.toHaveBeenCalled(); expect(h.release).not.toHaveBeenCalled();
    await abortNativeWorkerConnection("run", captured);
    expect(h.disconnect).not.toHaveBeenCalled(); expect(h.release).toHaveBeenCalled();
  });

  it("invalidates potentially rotated authentication and fences late writes before failed-turn teardown", async () => {
    h.runtime!.profileImported = true;
    await releaseNativeWorkerConnection("run", { stopped: true });
    expect(h.disconnect).toHaveBeenCalledWith("owner", "codex", h.lease);
    expect(h.disconnect.mock.invocationCallOrder[0]).toBeLessThan(h.cleanup.mock.invocationCallOrder[0]);
    expect(h.release).toHaveBeenCalledWith(expect.objectContaining({ kind: "stop", leaseId: "stop" }), { stopped: true });
  });

  it("retains cleanup authority when provider teardown remains uncertain", async () => {
    h.runtime!.profileImported = true;
    h.cleanup.mockRejectedValue(new Error("provider outcome unknown"));
    await expect(abortNativeWorkerConnection("run", h.lease!)).rejects.toThrow("provider outcome unknown");
    expect(h.release).not.toHaveBeenCalled();
  });

  it("passes the expected lease to cancellation and never redirects a stale cleanup to a replacement", async () => {
    h.runtime!.profileImported = true;
    const stale = { ...h.lease! };
    h.lease!.leaseId = "replacement";
    await expect(abortNativeWorkerConnection("run", stale)).resolves.toBeUndefined();
    await expect(releaseNativeWorkerConnection("run", { stopped: true }, stale)).resolves.toBeUndefined();
    expect(h.disconnect).not.toHaveBeenCalled();
    expect(h.cleanup).not.toHaveBeenCalled();
  });

  it("reconstructs cleanup authority only for the expected physical sandbox", async () => {
    await expect(getNativeWorkerCleanupLease("run", "sandbox")).resolves.toEqual(h.lease);
    await expect(getNativeWorkerCleanupLease("run", "old-sandbox")).resolves.toBeNull();
    expect(h.get).toHaveBeenCalledWith("run", undefined, { execution: false });
    expect(h.rpc).toHaveBeenCalledWith("get_native_worker_allocation", expect.objectContaining({ p_generation: 1, p_lease_id: "lease" }));
  });

  it("accepts profile revision progress while preserving a captured cleanup identity", async () => {
    const expected = { ...h.lease! };
    h.lease!.revision++;
    h.runtime!.profileImported = true;
    h.runtime!.profileSaved = true;
    await abortNativeWorkerConnection("run", expected);
    expect(h.stopLease).toHaveBeenCalledWith(expect.objectContaining({ revision: 4 }));
    expect(h.disconnect).not.toHaveBeenCalled();
    expect(h.cleanup).toHaveBeenCalled();
  });

  it("preserves authentication after an unbound or pre-injection bootstrap failure", async () => {
    h.runtime = null;
    h.lease!.workerAllocationId = undefined;
    h.maybeSingle.mockResolvedValue({ data: null, error: null });
    await abortNativeWorkerConnection("run", h.lease!);
    expect(h.stopLease).toHaveBeenCalledWith(h.lease);
    expect(h.release).toHaveBeenCalled();
    expect(h.disconnect).not.toHaveBeenCalled();
    expect(h.cleanup).not.toHaveBeenCalled();
  });

  it("does not inject credentials if the private directory cannot be protected", async () => {
    h.command.mockResolvedValue({ exitCode: 1 });
    await expect(restoreNativeWorkerProfile(h.lease!, sandbox())).rejects.toThrow("directory unavailable");
    expect(h.runtime!.profileImported).toBe(false);
    expect(h.write).not.toHaveBeenCalled();
  });
});
