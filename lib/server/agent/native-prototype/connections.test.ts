import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APIError } from "@vercel/sandbox";
import type { NativeCredentialProfile } from "@/lib/native-agent-prototype";
import type { NativeConnectionLease } from "../native-agent-credentials";
import { startNativeLogin, pollNativeLogin, cancelNativeLogin, disconnectNativePrototype,
  testNativeConnection, nativeConnectionMetadata, eraseNativePrototypeAccount, reapNativePrototypeConnections } from "./connections";

const h = vi.hoisted(() => ({
  current: null as NativeConnectionLease | null, profile: null as NativeCredentialProfile | null,
  runtime: null as Record<string, unknown> | null, enabled: true,
  events: [] as string[], allocations: [] as Array<{ name: string; request: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }>,
  imports: [] as NativeCredentialProfile[], mode: "smoke", authHook: null as (() => void) | null,
  list: vi.fn(), acquire: vi.fn(), getLease: vi.fn(), getRuntime: vi.fn(), setRuntime: vi.fn(),
  cleanupCandidates: vi.fn(),
  load: vi.fn(), save: vi.fn(), release: vi.fn(), disconnect: vi.fn(),
  create: vi.fn(), open: vi.fn(), budget: vi.fn(), charge: vi.fn(), executeTool: vi.fn(),
}));
vi.mock("../native-agent-credentials", () => ({ listNativeConnections: h.list, acquireNativeConnection: h.acquire,
  getNativeConnectionLease: h.getLease, getNativeRuntime: h.getRuntime, setNativeRuntime: h.setRuntime,
  loadNativeProfile: h.load, saveNativeProfile: h.save, releaseNativeConnection: h.release,
  disconnectNativeConnection: h.disconnect, listNativeCleanupCandidates: h.cleanupCandidates }));
vi.mock("./access", () => ({ nativePrototypeEnabledFor: (id: string) => h.enabled && id === USER,
  assertNativePrototypeAccess: (id: string) => { if (!h.enabled || id !== USER) throw new Error("private_prototype_unavailable"); } }));
vi.mock("./sandbox", () => ({ NATIVE_ALLOCATION_TIMEOUT_MS: 15 * 60_000,
  createNativeAllocation: h.create, openNativeAllocation: h.open }));
vi.mock("@/lib/server/usage", () => ({ ensureUsageBudget: h.budget, recordSandboxUsage: h.charge }));
vi.mock("./mcp", () => ({ nativePrototypeMcpTool: () => ({ name: "minddy_list_projects", description: "Actual tool fixture", inputSchema: {} }),
  executeNativePrototypeMcp: h.executeTool }));

const USER = "67600000-0000-4000-8000-000000000001";
const OTHER = "67600000-0000-4000-8000-000000000002";
const ORIGINAL_LEASE = "67600000-0000-4000-8000-000000000010";
const STOP_LEASE = "67600000-0000-4000-8000-000000000011";
const NEW_LEASE = "67600000-0000-4000-8000-000000000012";
const profile = (token: string): NativeCredentialProfile => ({ version: 1, engine: "codex",
  files: [{ path: "auth.json", content: JSON.stringify({ tokens: { access_token: token, refresh_token: `refresh-${token}` } }) }] });
const clone = <T,>(value: T): T => structuredClone(value);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function fence(lease: NativeConnectionLease) {
  if (!h.current || lease.userId !== h.current.userId || lease.engine !== h.current.engine ||
      lease.leaseId !== h.current.leaseId || lease.generation !== h.current.generation || lease.revision !== h.current.revision) {
    throw new Error("native_connection_stale_lease");
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  h.current = null; h.profile = profile("initial"); h.runtime = null; h.enabled = true;
  h.events.length = 0; h.allocations.length = 0; h.imports.length = 0; h.mode = "smoke"; h.authHook = null;
  h.budget.mockResolvedValue(undefined); h.charge.mockResolvedValue(undefined);
  h.cleanupCandidates.mockResolvedValue([]);
  h.executeTool.mockResolvedValue({ content: [{ type: "text", text: "Owner projects" }] });
  h.list.mockImplementation(async (id) => id === USER ? [{ id: "connection-1", engine: "codex",
    status: h.profile ? "connected" : "disconnected", busy: !!h.current,
    stopRequired: h.current?.kind === "stop", updatedAt: "2026-10-10" }] : []);
  h.acquire.mockImplementation(async (userId, engine, kind) => {
    if (h.current) throw new Error("busy");
    h.current = { connectionId: "connection-1", userId, engine, kind, generation: 1,
      revision: 1, leaseId: ORIGINAL_LEASE, leaseExpiresAt: "2030-01-01" };
    return clone(h.current);
  });
  h.getLease.mockImplementation(async (id, engine) => h.current && h.current.userId === id && h.current.engine === engine ? clone(h.current) : null);
  h.getRuntime.mockImplementation(async (lease) => { fence(lease); return clone(h.runtime); });
  h.setRuntime.mockImplementation(async (lease, value) => {
    fence(lease); h.runtime = clone(value); lease.revision++; h.current!.revision = lease.revision;
    h.events.push(value ? `runtime:${value.phase}` : "runtime:cleared");
  });
  h.load.mockImplementation(async (lease) => { fence(lease); return clone(h.profile); });
  h.save.mockImplementation(async (lease, value) => {
    fence(lease); h.profile = clone(value); lease.revision++; h.current!.revision = lease.revision;
    h.events.push("profile:saved");
  });
  h.release.mockImplementation(async (lease, confirmation) => {
    fence(lease); expect(confirmation).toEqual({ stopped: true });
    h.events.push(`release:${lease.leaseId}`); h.current = null; h.runtime = null;
  });
  h.disconnect.mockImplementation(async (userId, engine, expected) => {
    if (expected && (!h.current || expected.leaseId !== h.current.leaseId || expected.generation !== h.current.generation)) {
      throw new Error("native_connection_stale_lease");
    }
    h.events.push("disconnect:fenced"); h.profile = null;
    if (h.current) {
      h.current = { ...h.current, userId, engine, kind: "stop", generation: h.current.generation + 1,
        revision: h.current.revision + 1, leaseId: STOP_LEASE };
    }
    return { lease: clone(h.current), runtime: clone(h.runtime) };
  });
  h.create.mockImplementation(async (name, _token, _engine, onCreated) => {
    const index = h.allocations.length;
    h.events.push(`create:${index + 1}`);
    let observed = false;
    const allocation = { name,
      billing: { region: "iad1", vcpus: 2, memoryMb: 4096, usdPerMinute: 0.004 },
      destroy: vi.fn(async () => { h.events.push(`destroy:${index + 1}`); }),
      request: vi.fn(async (operation, body) => {
        if (operation === "/login/start") return { engine: "codex", phase: "awaiting_user", authenticated: false,
          verificationUrl: "https://auth.openai.com/codex/device", userCode: "ABCD-EFGH" };
        if (operation === "/profile/import") { h.imports.push(clone(body.profile)); return {}; }
        if (operation === "/auth/check") { h.authHook?.(); return { authenticated: true }; }
        if (operation === "/smoke") return {};
        if (operation === "/tool-result") { observed = true; return {}; }
        if (operation === "/status") {
          if (h.mode === "login") return { engine: "codex", phase: "authenticated", authenticated: true };
          return observed ? { phase: "completed", toolObserved: true, markerObserved: true }
            : { phase: "running", pendingTools: [{ id: "call-1", name: "minddy_list_projects", args: {} }] };
        }
        if (operation === "/profile/export") return profile(`renewed-${index + 1}`);
        throw new Error("Unsupported mocked operation");
      }),
    };
    h.allocations.push(allocation); await onCreated?.(allocation); return allocation;
  });
  h.open.mockImplementation(async (name) => {
    const allocation = h.allocations.find((item) => item.name === name);
    if (!allocation) throw new Error("Allocation not found");
    return allocation;
  });
});
afterEach(() => { vi.useRealTimers(); });

describe("private native subscription orchestration", () => {
  it("restores renewed profiles into two fresh allocations and destroys each before creating the next", async () => {
    vi.useFakeTimers();
    const pending = testNativeConnection(USER, "codex");
    await vi.advanceTimersByTimeAsync(2100);
    const result = await pending;
    expect(result).toMatchObject({ passed: true, refreshObserved: true });
    expect(result.allocations).toHaveLength(2);
    expect(result.allocations.every((item) => item.authenticated && item.mcpVerified && item.destroyed)).toBe(true);
    expect(result.allocations[0].id).not.toBe(result.allocations[1].id);
    expect(h.imports).toEqual([profile("initial"), profile("renewed-1")]);
    expect(h.events.indexOf("destroy:1")).toBeLessThan(h.events.indexOf("create:2"));
    expect(h.executeTool).toHaveBeenCalledWith({}, USER);
    expect(h.release).toHaveBeenCalledTimes(1);
    expect(h.charge).toHaveBeenCalledTimes(2);
    expect(h.current).toBeNull();
  });

  it("keeps the pilot owner-gated and acquires no lease for another account or disabled feature", async () => {
    await expect(testNativeConnection(OTHER, "codex")).rejects.toThrow("private_prototype_unavailable");
    h.enabled = false;
    expect(await nativeConnectionMetadata(USER)).toEqual({ enabled: false, connections: [] });
    await expect(startNativeLogin(USER, "codex")).rejects.toThrow("private_prototype_unavailable");
    expect(h.acquire).not.toHaveBeenCalled(); expect(h.create).not.toHaveBeenCalled();
  });

  it("does not allocate compute when another lease is busy or budget admission fails", async () => {
    h.list.mockResolvedValueOnce([{ engine: "codex", status: "connected", busy: true, stopRequired: false }]);
    await expect(testNativeConnection(USER, "codex")).rejects.toThrow("connection_busy");
    h.budget.mockRejectedValueOnce(new Error("usage budget exceeded"));
    await expect(testNativeConnection(USER, "codex")).rejects.toThrow("usage budget exceeded");
    expect(h.acquire).not.toHaveBeenCalled(); expect(h.create).not.toHaveBeenCalled();
  });

  it("cleans a claimed lease when loading the encrypted profile fails", async () => {
    h.load.mockRejectedValueOnce(new Error("Encrypted profile cannot be decrypted"));
    const result = await testNativeConnection(USER, "codex");
    expect(result.passed).toBe(false); expect(result.errorCode).toBe("test_failed");
    expect(h.release).toHaveBeenCalledTimes(1); expect(h.create).not.toHaveBeenCalled();
    expect(h.current).toBeNull();
  });

  it("persists login once and reports completion after its runtime has been destroyed", async () => {
    h.profile = null; h.mode = "login";
    const login = await startNativeLogin(USER, "codex");
    expect(login.status).toBe("waiting");
    const complete = await pollNativeLogin(USER, "codex", login.attemptId);
    expect(complete.status).toBe("connected"); expect(h.current).toBeNull();
    expect(h.allocations[0].destroy).toHaveBeenCalledTimes(1);
    expect((await pollNativeLogin(USER, "codex", login.attemptId)).status).toBe("connected");
  });

  it("leaves the winning finalizer running when another poll loses the same-lease revision fence", async () => {
    h.profile = null; h.mode = "login";
    const login = await startNativeLogin(USER, "codex");
    const bothReadingStatus = deferred<void>();
    const releaseStatuses = deferred<void>();
    const exporting = deferred<void>();
    const exported = deferred<NativeCredentialProfile>();
    let statusCalls = 0;
    const request = h.allocations[0].request;
    const original = request.getMockImplementation()! as (operation: unknown, body: unknown) => Promise<unknown>;
    request.mockImplementation(async (operation, body) => {
      if (operation === "/status") {
        if (++statusCalls === 2) bothReadingStatus.resolve();
        await releaseStatuses.promise;
        return { engine: "codex", phase: "authenticated", authenticated: true };
      }
      if (operation === "/profile/export") { exporting.resolve(); return exported.promise; }
      return original(operation, body);
    });
    const first = pollNativeLogin(USER, "codex", login.attemptId);
    const second = pollNativeLogin(USER, "codex", login.attemptId);
    await bothReadingStatus.promise;
    releaseStatuses.resolve();
    await exporting.promise;
    expect((await Promise.race([first, second])).status).toBe("waiting");
    expect(h.allocations[0].destroy).not.toHaveBeenCalled();
    exported.resolve(profile("finalized"));
    expect((await Promise.all([first, second])).map((result) => result.status).sort()).toEqual(["connected", "waiting"]);
    expect(h.allocations[0].destroy).toHaveBeenCalledTimes(1);
    expect(h.release).toHaveBeenCalledTimes(1);
  });

  it("stops an old finalizer after a late export failure without revoking a newer login", async () => {
    h.profile = null; h.mode = "login";
    const login = await startNativeLogin(USER, "codex");
    const request = h.allocations[0].request;
    const original = request.getMockImplementation()! as (operation: unknown, body: unknown) => Promise<unknown>;
    request.mockImplementation(async (operation, body) => {
      if (operation === "/profile/export") {
        h.current = { ...h.current!, generation: 3, revision: 20, leaseId: NEW_LEASE, kind: "login" };
        h.profile = profile("new-login-profile");
        throw new Error("Old export failed after disconnect and replacement login");
      }
      return original(operation, body);
    });
    await expect(pollNativeLogin(USER, "codex", login.attemptId)).rejects.toThrow("login_failed");
    expect(h.allocations[0].destroy).toHaveBeenCalledTimes(1);
    expect(h.disconnect).not.toHaveBeenCalled();
    expect(h.release).not.toHaveBeenCalled();
    expect(h.current?.leaseId).toBe(NEW_LEASE);
    expect(h.profile).toEqual(profile("new-login-profile"));
  });

  it("fences cancellation before destruction and refuses an unrelated login attempt", async () => {
    h.profile = null;
    const login = await startNativeLogin(USER, "codex");
    await expect(cancelNativeLogin(USER, "codex", "67600000-0000-4000-8000-000000000009")).rejects.toThrow("login_failed");
    expect(h.disconnect).not.toHaveBeenCalled();
    await cancelNativeLogin(USER, "codex", login.attemptId);
    expect(h.disconnect).toHaveBeenCalledWith(USER, "codex", expect.objectContaining({ leaseId: ORIGINAL_LEASE, generation: 1 }));
    expect(h.events.indexOf("disconnect:fenced")).toBeLessThan(h.events.indexOf("destroy:1"));
    expect(h.current).toBeNull();
  });

  it("stops its old allocation without overwriting or cancelling a replacement connection", async () => {
    h.authHook = () => {
      h.current = { ...h.current!, generation: 3, revision: 20, leaseId: NEW_LEASE, kind: "login" };
      h.profile = profile("new-owner-login");
    };
    const result = await testNativeConnection(USER, "codex");
    expect(result.passed).toBe(false);
    expect(h.allocations[0].destroy).toHaveBeenCalled();
    expect(h.disconnect).not.toHaveBeenCalled(); expect(h.release).not.toHaveBeenCalled();
    expect(h.current?.leaseId).toBe(NEW_LEASE);
    expect(h.profile).toEqual(profile("new-owner-login"));
    expect(h.executeTool).not.toHaveBeenCalled();
  });

  it("retains the stop lease and runtime when provider destruction cannot be confirmed", async () => {
    h.profile = null;
    await startNativeLogin(USER, "codex");
    h.allocations[0].destroy.mockRejectedValue(new Error("Provider deletion is unavailable"));
    await expect(disconnectNativePrototype(USER, "codex")).rejects.toThrow("deletion is unavailable");
    expect(h.current?.kind).toBe("stop"); expect(h.runtime).not.toBeNull();
    expect(h.profile).toBeNull(); expect(h.release).not.toHaveBeenCalled();
  });

  it("retains the persisted allocation descriptor when SDK creation has an ambiguous outcome", async () => {
    h.profile = null;
    h.create.mockRejectedValueOnce(new Error("Creation transport interrupted"));
    h.open.mockRejectedValueOnce(new APIError(new Response(null, { status: 404 })));
    await expect(startNativeLogin(USER, "codex")).rejects.toThrow();
    expect(h.current).not.toBeNull();
    expect(h.runtime).toMatchObject({ phase: "allocating" });
    expect(h.release).not.toHaveBeenCalled();
    expect(h.save).not.toHaveBeenCalled();
    expect(h.allocations).toHaveLength(0);
  });

  it("erases existing native runtimes even when the private feature has been disabled", async () => {
    h.profile = null;
    await startNativeLogin(USER, "codex");
    h.enabled = false;
    await eraseNativePrototypeAccount(USER);
    expect(h.disconnect).toHaveBeenCalledWith(USER, "codex", undefined);
    expect(h.allocations[0].destroy).toHaveBeenCalledTimes(1);
    expect(h.current).toBeNull(); expect(h.profile).toBeNull();
  });

  it("reaps expired native leases without requiring preview access and skips a renewed fresh lease", async () => {
    h.profile = null;
    await startNativeLogin(USER, "codex");
    h.enabled = false;
    h.cleanupCandidates.mockResolvedValue([{ userId: USER, engine: "codex" }]);
    expect(await reapNativePrototypeConnections()).toEqual({ stopped: 0, pending: 0 });
    expect(h.disconnect).not.toHaveBeenCalled();
    h.current!.leaseExpiresAt = "2000-01-01";
    expect(await reapNativePrototypeConnections()).toEqual({ stopped: 1, pending: 0 });
    expect(h.cleanupCandidates).toHaveBeenCalledWith(8);
    expect(h.disconnect).toHaveBeenCalledWith(USER, "codex", expect.objectContaining({ leaseId: ORIGINAL_LEASE }));
    expect(h.current).toBeNull();
  });

  it("keeps failed reaper cleanup pending and retries the preserved stop authority", async () => {
    h.profile = null;
    await startNativeLogin(USER, "codex");
    h.current!.leaseExpiresAt = "2000-01-01";
    h.cleanupCandidates.mockResolvedValue([{ userId: USER, engine: "codex" }]);
    h.allocations[0].destroy.mockRejectedValueOnce(new Error("Provider unavailable"));
    expect(await reapNativePrototypeConnections()).toEqual({ stopped: 0, pending: 1 });
    expect(h.current?.kind).toBe("stop"); expect(h.runtime).not.toBeNull();
    expect(h.release).not.toHaveBeenCalled();
    expect(await reapNativePrototypeConnections()).toEqual({ stopped: 1, pending: 0 });
    expect(h.current).toBeNull();
    expect(h.charge).toHaveBeenCalledWith(expect.objectContaining({ runId: ORIGINAL_LEASE, seq: 0 }));
  });
});
