import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { EncryptedStore } from "@/lib/server/encryption/store";
import { RootKeyCrypto } from "@/lib/server/encryption/root-key-crypto.mjs";
import type { NativeCredentialProfile } from "@/lib/native-agent-prototype";

const h = vi.hoisted(() => ({
  store: null as EncryptedStore | null,
  select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), single: vi.fn(),
  not: vi.fn(), or: vi.fn(), order: vi.fn(), limit: vi.fn(),
  from: vi.fn(), rpc: vi.fn(),
}));
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => {
  if (!h.store) throw new Error("Encryption is unavailable");
  return h.store;
} }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ from: h.from, rpc: h.rpc }) }));
const {
  encryptNativeProfile, decryptNativeProfile, validateNativeProfile, saveNativeProfile, commitNativeWorkerProfile, commitNativeLoginProfile,
  setNativeRuntime, releaseNativeConnection, listNativeConnections, getNativeConnectionLease,
  disconnectNativeConnection,
  listNativeCleanupCandidates,
  getNativeRuntime,
  acquireNativeWorkerConnection, getNativeWorkerConnection, renewNativeWorkerLease, stopNativeWorkerLease,
} = await import("./native-agent-credentials");
type Lease = import("./native-agent-credentials").NativeConnectionLease;

const lease = (): Lease => ({ connectionId: "connection-1", userId: "user-1", engine: "codex",
  generation: 1, leaseId: "lease-1", revision: 2, kind: "login",
  leaseExpiresAt: "2030-01-01T00:00:00.000Z" });
const profile: NativeCredentialProfile = { version: 1, engine: "codex",
  files: [{ path: "auth.json", content: JSON.stringify({ tokens: { access_token: "private-access", refresh_token: "private-refresh" } }) }] };

beforeEach(() => {
  vi.resetAllMocks();
  const key = Buffer.alloc(32, 79);
  h.store = new EncryptedStore({ current: async () => ({ version: 1, bytes: Buffer.from(key) }),
    byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }) });
  const query = { select: h.select, eq: h.eq, maybeSingle: h.maybeSingle,
    not: h.not, or: h.or, order: h.order, limit: h.limit };
  h.from.mockReturnValue(query); h.select.mockReturnValue(query); h.eq.mockReturnValue(query);
  h.not.mockReturnValue(query); h.or.mockReturnValue(query); h.order.mockReturnValue(query);
  h.rpc.mockReturnValue({ single: h.single, maybeSingle: h.maybeSingle });
});

describe("native subscription credential storage", () => {
  it("restores a synthetic vault backup after root rewrap without rewriting credentials or weakening ownership", async () => {
    const owner = lease();
    const scope = { kind: "user" as const, id: owner.userId };
    const oldRoot = randomBytes(32).toString("hex");
    const nextRoot = randomBytes(32).toString("hex");
    const generated = await new RootKeyCrypto(oldRoot).generate(scope);
    let wrappedKey = Buffer.from(generated.wrappedKey);
    generated.bytes.fill(0);
    const restoreStore = (root: string) => {
      const crypto = new RootKeyCrypto(root);
      h.store = new EncryptedStore({
        current: async (requested) => ({ version: 1,
          bytes: await crypto.unwrap({ scope: requested, version: 1, wrappedKey }) }),
        byVersion: async (requested, version) => {
          if (version !== 1) throw new Error("Unknown backup data key version");
          return { version, bytes: await crypto.unwrap({ scope: requested, version, wrappedKey }) };
        },
      });
    };
    restoreStore(oldRoot);
    const profileCiphertext = await encryptNativeProfile(owner, profile);
    h.single.mockResolvedValue({ data: { revision: 3 }, error: null });
    await setNativeRuntime(owner, { sandboxId: "synthetic-allocation", controllerToken: "synthetic-controller" });
    const runtimeCiphertext = h.rpc.mock.calls[0][1].p_ciphertext as string;
    const backup = JSON.parse(JSON.stringify({ profileCiphertext, runtimeCiphertext,
      wrappedKey: wrappedKey.toString("base64") })) as {
      profileCiphertext: string; runtimeCiphertext: string; wrappedKey: string;
    };
    wrappedKey = Buffer.from(backup.wrappedKey, "base64");
    restoreStore(nextRoot);
    await expect(decryptNativeProfile(owner, backup.profileCiphertext)).rejects.toThrow("Unable to unwrap");

    const dataKey = await new RootKeyCrypto(oldRoot).unwrap({ scope, version: 1, wrappedKey });
    try { wrappedKey = new RootKeyCrypto(nextRoot).wrap(scope, dataKey); }
    finally { dataKey.fill(0); }
    restoreStore(nextRoot);
    await expect(decryptNativeProfile(owner, backup.profileCiphertext)).resolves.toEqual(profile);
    h.single.mockResolvedValue({ data: { runtime_ciphertext: backup.runtimeCiphertext }, error: null });
    await expect(getNativeRuntime(owner)).resolves.toEqual({
      sandboxId: "synthetic-allocation", controllerToken: "synthetic-controller",
    });
    for (const change of [{ userId: "different-owner" }, { connectionId: "different-connection" },
      { engine: "claude_code" as const }]) {
      await expect(decryptNativeProfile({ ...owner, ...change }, backup.profileCiphertext)).rejects.toThrow();
    }
    await expect(decryptNativeProfile(owner, backup.runtimeCiphertext)).rejects.toThrow();
    expect(backup.profileCiphertext).toBe(profileCiphertext);
    expect(backup.runtimeCiphertext).toBe(runtimeCiphertext);
    restoreStore(oldRoot);
    await expect(decryptNativeProfile(owner, backup.profileCiphertext)).rejects.toThrow("Unable to unwrap");
  });

  it("always encrypts profiles and binds the owner, provider and connection", async () => {
    const cipher = await encryptNativeProfile(lease(), profile);
    expect(cipher).not.toContain("private-access");
    expect(cipher).not.toContain("private-refresh");
    expect(JSON.parse(cipher).format).toBe(3);
    await expect(decryptNativeProfile(lease(), cipher)).resolves.toEqual(profile);
    for (const change of [{ userId: "user-2" }, { connectionId: "connection-2" }, { engine: "claude_code" as const }]) {
      await expect(decryptNativeProfile({ ...lease(), ...change }, cipher)).rejects.toThrow();
    }
    h.store = null;
    await expect(encryptNativeProfile(lease(), profile)).rejects.toThrow("Encryption is unavailable");
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects unapproved paths, duplicate paths, provider swaps, oversized data and plaintext envelopes", async () => {
    for (const file of [{ path: "../auth.json", content: "{}" }, { path: "/auth.json", content: "{}" },
      { path: "sessions/thread.json", content: "{}" }, { path: "auth.json", content: "null" },
      { path: "auth.json", content: JSON.stringify({ value: "x".repeat(65536) }) }]) {
      expect(() => validateNativeProfile({ ...profile, files: [file] }, "codex")).toThrow();
    }
    expect(() => validateNativeProfile({ ...profile, files: [...profile.files, ...profile.files] }, "codex")).toThrow();
    expect(() => validateNativeProfile({ ...profile, engine: "claude_code" }, "codex")).toThrow();
    expect(() => validateNativeProfile({ ...profile, files: [{ path: "auth.json", content: "{}", mode: 777 }] }, "codex")).toThrow();
    await expect(decryptNativeProfile(lease(), JSON.stringify(profile))).rejects.toThrow();
  });

  it("persists only ciphertext with the complete stale-write fence and updates the lease revision", async () => {
    const owned = lease();
    h.single.mockResolvedValue({ data: { revision: 3 }, error: null });
    await saveNativeProfile(owned, profile);
    expect(h.rpc).toHaveBeenCalledWith("write_native_agent_connection", expect.objectContaining({
      p_id: "connection-1", p_user_id: "user-1", p_engine: "codex", p_generation: 1,
      p_lease_id: "lease-1", p_revision: 2, p_runtime: false,
    }));
    expect(h.rpc.mock.calls[0][1].p_ciphertext).not.toContain("private-refresh");
    expect(owned.revision).toBe(3);
    h.single.mockResolvedValue({ data: null, error: { message: "native_connection_stale_lease" } });
    await expect(saveNativeProfile(owned, profile)).rejects.toThrow("operation rejected");
    expect(owned.revision).toBe(3);
  });

  it("commits initial login and its recovery marker encrypted under one revision fence", async () => {
    const owned = lease(); const runtime = { phase: "finalizing", profileSaved: true, sandboxId: "synthetic-sandbox" };
    h.single.mockResolvedValueOnce({ data: { revision: 3 }, error: null });
    await commitNativeLoginProfile(owned, profile, runtime);
    expect(h.rpc).toHaveBeenCalledWith("commit_native_login_profile", expect.objectContaining({
      p_revision: 2, p_generation: 1, p_lease_id: "lease-1", p_user_id: "user-1" }));
    expect(h.rpc.mock.calls[0][1].p_profile_ciphertext).not.toContain("private-refresh");
    expect(h.rpc.mock.calls[0][1].p_runtime_ciphertext).not.toContain("synthetic-sandbox");
    expect(owned.revision).toBe(3);
    h.single.mockResolvedValue({ data: null, error: { message: "Commit response lost" } });
    await expect(commitNativeLoginProfile(owned, profile, runtime)).rejects.toThrow("operation rejected");
    expect(owned.revision).toBe(3);
    await expect(commitNativeLoginProfile({ ...owned, kind: "worker" }, profile, runtime)).rejects.toThrow("commit invalid");
  });

  it("encrypts both worker payloads in one fenced commit and rejects account replacement before writing", async () => {
    const owned = { ...lease(), kind: "worker" as const, workerRunId: "run-1", workerAllocationId: "allocation-1" };
    const original = { ...profile, files: [{ path: "auth.json", content: JSON.stringify({ tokens: {
      account_id: "account-1", access_token: "old-access", refresh_token: "old-refresh" } }) }] };
    const rotated = { ...original, files: [{ path: "auth.json", content: JSON.stringify({ tokens: {
      account_id: "account-1", access_token: "new-access", refresh_token: "new-refresh" } }) }] };
    const ciphertext = await encryptNativeProfile(owned, original);
    const runtime = { kind: "worker", runId: "run-1", allocationId: "allocation-1", profileImported: true, profileSaved: true };
    h.single.mockResolvedValueOnce({ data: { profile_ciphertext: ciphertext }, error: null })
      .mockResolvedValueOnce({ data: { revision: 3 }, error: null });
    await commitNativeWorkerProfile(owned, rotated, runtime);
    const args = h.rpc.mock.calls[1][1];
    expect(h.rpc.mock.calls[1][0]).toBe("commit_native_worker_profile");
    expect(args).toMatchObject({ p_revision: 2, p_generation: 1, p_lease_id: "lease-1" });
    expect(args.p_profile_ciphertext).not.toContain("new-refresh");
    expect(args.p_runtime_ciphertext).not.toContain("allocation-1");
    expect(owned.revision).toBe(3);
    for (const account_id of ["account-2", undefined]) {
      h.rpc.mockClear(); h.single.mockResolvedValue({ data: { profile_ciphertext: ciphertext }, error: null });
      const changed = { ...rotated, files: [{ path: "auth.json", content: JSON.stringify({ tokens: {
        account_id, access_token: "new-access", refresh_token: "new-refresh" } }) }] };
      await expect(commitNativeWorkerProfile(owned, changed, runtime)).rejects.toThrow("account changed");
      expect(h.rpc).toHaveBeenCalledTimes(1); expect(owned.revision).toBe(3);
    }
  });

  it("encrypts control descriptors with a distinct column binding", async () => {
    h.single.mockResolvedValue({ data: { revision: 3 }, error: null });
    await setNativeRuntime(lease(), { sandboxId: "private-sandbox", controllerToken: "private-control-token" });
    const ciphertext = h.rpc.mock.calls[0][1].p_ciphertext;
    expect(ciphertext).not.toContain("private-sandbox");
    expect(ciphertext).not.toContain("private-control-token");
    await expect(decryptNativeProfile(lease(), ciphertext)).rejects.toThrow();
  });

  it("does not select or decrypt credential payloads to display connection metadata", async () => {
    h.eq.mockResolvedValue({ data: [{ id: "connection-1", engine: "codex", status: "connected",
      generation: 1, revision: 2, lease_id: "lease-1", lease_kind: "test", lease_expires_at: "2000-01-01",
      updated_at: "2000-01-01" }], error: null });
    h.store = null;
    await expect(listNativeConnections("user-1")).resolves.toMatchObject([{ busy: true, stopRequired: true }]);
    expect(h.select.mock.calls[0][0]).not.toMatch(/ciphertext|profile|runtime/);
    expect(h.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("reconstructs only owner-bound lease metadata without decrypting the profile", async () => {
    h.maybeSingle.mockResolvedValue({ data: { id: "connection-1", user_id: "user-1", engine: "codex",
      generation: 1, revision: 2, lease_id: "lease-1", lease_kind: "login", lease_expires_at: "2030-01-01T00:00:00.000Z" }, error: null });
    h.store = null;
    await expect(getNativeConnectionLease("user-1", "codex")).resolves.toEqual(lease());
    expect(h.select.mock.calls[0][0]).not.toMatch(/ciphertext|profile|runtime/);
    expect(h.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(h.eq).toHaveBeenCalledWith("engine", "codex");
  });

  it("requires explicit process-stop confirmation before releasing the lease", async () => {
    await expect(releaseNativeConnection(lease(), { stopped: false } as unknown as { stopped: true })).rejects.toThrow("stop confirmation");
    expect(h.rpc).not.toHaveBeenCalled();
    h.single.mockResolvedValue({ data: { revision: 3 }, error: null });
    await releaseNativeConnection(lease(), { stopped: true });
    expect(h.rpc).toHaveBeenCalledWith("release_native_agent_connection", expect.objectContaining({
      p_user_id: "user-1", p_generation: 1, p_lease_id: "lease-1", p_revision: 2,
    }));
  });

  it("preserves the stop authority returned by disconnect rather than releasing an old process", async () => {
    h.single.mockResolvedValue({ data: { id: "connection-1", user_id: "user-1", engine: "codex",
      generation: 2, revision: 5, lease_id: "stop-lease-1", lease_kind: "stop", lease_expires_at: "2030-01-01",
      runtime_ciphertext: null }, error: null });
    const disconnected = await disconnectNativeConnection("user-1", "codex");
    expect(disconnected.lease).toMatchObject({ generation: 2, revision: 5, leaseId: "stop-lease-1", kind: "stop" });
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it("atomically limits failure cleanup to the expected connection generation and lease", async () => {
    h.single.mockResolvedValue({ data: null, error: { message: "native_connection_stale_lease" } });
    await expect(disconnectNativeConnection("user-1", "codex", lease())).rejects.toThrow("operation rejected");
    expect(h.rpc).toHaveBeenCalledWith("disconnect_native_agent_connection", {
      p_user_id: "user-1", p_engine: "codex", p_expected_generation: 1, p_expected_lease_id: "lease-1",
    });
    h.rpc.mockClear();
    await expect(disconnectNativeConnection("other-user", "codex", lease())).rejects.toThrow("owner mismatch");
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("enumerates bounded cleanup metadata while encryption and the private preview are unavailable", async () => {
    h.store = null;
    h.limit.mockResolvedValue({ data: [{ user_id: "user-1", engine: "codex" }], error: null });
    await expect(listNativeCleanupCandidates()).resolves.toEqual([{ userId: "user-1", engine: "codex" }]);
    expect(h.select).toHaveBeenCalledWith("user_id,engine");
    expect(h.not).toHaveBeenCalledWith("lease_id", "is", null);
    expect(h.or).toHaveBeenCalledWith(expect.stringMatching(/^lease_kind.eq.stop,lease_expires_at.lte./));
    expect(h.order).toHaveBeenCalledWith("updated_at", { ascending: true });
    expect(h.limit).toHaveBeenCalledWith(8);
    for (const limit of [0, -1, 33, 1.5]) await expect(listNativeCleanupCandidates(limit)).rejects.toThrow("batch limit");
  });

  it("distinguishes ordinary execution authorization from expired-runtime cleanup reads", async () => {
    h.single.mockResolvedValue({ data: { runtime_ciphertext: null }, error: null });
    await getNativeRuntime(lease(), { execution: true });
    expect(h.rpc).toHaveBeenLastCalledWith("read_native_agent_connection", expect.objectContaining({
      p_runtime: true, p_execution: true, p_user_id: "user-1", p_lease_id: "lease-1", p_revision: 2,
    }));
    await getNativeRuntime(lease());
    expect(h.rpc.mock.lastCall?.[1]).not.toHaveProperty("p_execution");
  });

  it("derives worker ownership from the frozen run and distinguishes busy admission from database failure", async () => {
    h.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(acquireNativeWorkerConnection("run-1")).resolves.toBeNull();
    expect(h.rpc).toHaveBeenCalledWith("acquire_native_worker_connection", { p_run_id: "run-1" });
    h.maybeSingle.mockResolvedValue({ data: null, error: { message: "owner mismatch" } });
    await expect(acquireNativeWorkerConnection("run-1")).rejects.toThrow("admission rejected");
  });

  it("keeps worker control-plane lookups metadata-only and permits explicit cleanup reads", async () => {
    h.store = null;
    h.maybeSingle.mockResolvedValue({ data: { id: "connection-1", user_id: "user-1", engine: "codex",
      generation: 1, revision: 2, lease_id: "lease-1", lease_kind: "worker", lease_expires_at: "2030-01-01",
      worker_run_id: "run-1", worker_allocation_id: "allocation-1" }, error: null });
    await expect(getNativeWorkerConnection("run-1", "sandbox-1")).resolves.toMatchObject({
      userId: "user-1", kind: "worker", workerRunId: "run-1", workerAllocationId: "allocation-1",
    });
    expect(h.rpc).toHaveBeenCalledWith("get_native_worker_connection", {
      p_run_id: "run-1", p_sandbox_name: "sandbox-1", p_execution: true,
    });
    await getNativeWorkerConnection("run-1", undefined, { execution: false });
    expect(h.rpc).toHaveBeenLastCalledWith("get_native_worker_connection", {
      p_run_id: "run-1", p_sandbox_name: null, p_execution: false,
    });
  });

  it("renews worker expiry without advancing the write-back revision and fences pre-injection stop", async () => {
    const owned = { ...lease(), kind: "worker" as const, workerRunId: "run-1" };
    h.single.mockResolvedValue({ data: { revision: 2, lease_expires_at: "2031-01-01" }, error: null });
    await renewNativeWorkerLease(owned);
    expect(owned.revision).toBe(2);
    expect(owned.leaseExpiresAt).toBe("2031-01-01");
    h.single.mockResolvedValue({ data: { id: "connection-1", user_id: "user-1", engine: "codex", generation: 1,
      revision: 3, lease_id: "stop-lease", lease_kind: "stop", lease_expires_at: "2031-01-01", worker_run_id: "run-1" }, error: null });
    await expect(stopNativeWorkerLease(owned)).resolves.toMatchObject({ generation: 1, leaseId: "stop-lease", kind: "stop" });
    expect(h.rpc).toHaveBeenLastCalledWith("stop_native_worker_connection", expect.objectContaining({
      p_user_id: "user-1", p_lease_id: "lease-1", p_revision: 2,
    }));
  });
});
