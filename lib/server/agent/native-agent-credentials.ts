import "server-only";

import type { NativeCredentialProfile, NativeHarness } from "@/lib/native-agent-prototype";
import { getServiceClient } from "@/lib/supabase-service";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import type { EncryptionContext } from "@/lib/server/encryption/store";

export type NativeConnectionLease = {
  connectionId: string;
  userId: string;
  engine: NativeHarness;
  generation: number;
  leaseId: string;
  revision: number;
  kind: "login" | "test" | "worker" | "stop";
  leaseExpiresAt: string;
  workerRunId?: string;
  workerAllocationId?: string;
};

export type NativeConnectionMetadata = {
  id: string;
  engine: NativeHarness;
  status: "connected" | "disconnected";
  busy: boolean;
  stopRequired: boolean;
  generation: number;
  revision: number;
  updatedAt: string;
};

type StoredConnection = {
  id: string;
  user_id: string;
  engine: NativeHarness;
  status: "connected" | "disconnected";
  generation: number;
  revision: number;
  lease_id: string | null;
  lease_kind: "login" | "test" | "worker" | "stop" | null;
  lease_expires_at: string | null;
  worker_run_id?: string | null;
  worker_allocation_id?: string | null;
  updated_at: string;
  profile_ciphertext?: string | null;
  runtime_ciphertext?: string | null;
};

const PROFILE_LIMIT = 64 * 1024;
const RUNTIME_LIMIT = 16 * 1024;
const AUTH_PATHS: Record<NativeHarness, readonly string[]> = {
  codex: ["auth.json"],
  claude_code: [".credentials.json", ".claude.json"],
};

function assertEngine(engine: string): asserts engine is NativeHarness {
  if (engine !== "codex" && engine !== "claude_code") throw new Error("Unsupported native harness");
}

/** Credentials are limited to native authentication files, never whole home directories. */
export function validateNativeProfile(profile: unknown, engine: NativeHarness): NativeCredentialProfile {
  assertEngine(engine);
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    throw new Error("Invalid native credential profile");
  }
  const value = profile as NativeCredentialProfile;
  if (value.version !== 1 || value.engine !== engine || !Array.isArray(value.files) ||
      value.files.length < 1 || value.files.length > AUTH_PATHS[engine].length ||
      Object.keys(value).some((key) => !["version", "engine", "files"].includes(key))) {
    throw new Error("Invalid native credential profile");
  }
  const seen = new Set<string>();
  for (const file of value.files) {
    if (!file || typeof file !== "object" || Array.isArray(file) ||
        !AUTH_PATHS[engine].includes(file.path) || seen.has(file.path) ||
        typeof file.content !== "string" || file.content.length === 0 ||
        Object.keys(file).some((key) => !["path", "content"].includes(key))) {
      throw new Error("Invalid native credential file");
    }
    seen.add(file.path);
    let parsed: unknown;
    try { parsed = JSON.parse(file.content); } catch { throw new Error("Invalid native credential file"); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid native credential file");
    }
  }
  const required = engine === "codex" ? "auth.json" : ".credentials.json";
  if (!seen.has(required) || Buffer.byteLength(JSON.stringify(value), "utf8") > PROFILE_LIMIT) {
    throw new Error("Invalid native credential profile");
  }
  return value;
}

function binding(lease: Pick<NativeConnectionLease, "userId" | "connectionId" | "engine">,
  column: "profile_ciphertext" | "runtime_ciphertext"): EncryptionContext {
  assertEngine(lease.engine);
  if (!lease.userId || !lease.connectionId) throw new Error("Native credential owner is required");
  return { scope: { kind: "user", id: lease.userId }, table: "native_agent_connections",
    column, rowId: `${lease.connectionId}:${lease.engine}` };
}

export async function encryptNativeProfile(lease: NativeConnectionLease, profile: NativeCredentialProfile) {
  return getEncryptedStore().encrypt(validateNativeProfile(profile, lease.engine), binding(lease, "profile_ciphertext"));
}

export async function decryptNativeProfile(lease: NativeConnectionLease, ciphertext: string) {
  const store = getEncryptedStore();
  const value = store.fromDatabase<NativeCredentialProfile>(ciphertext);
  if (store.formatOf(value) !== 3) throw new Error("Invalid native credential envelope");
  return validateNativeProfile(await store.decrypt(value, binding(lease, "profile_ciphertext")), lease.engine);
}

async function encryptRuntime(lease: NativeConnectionLease, runtime: Record<string, unknown>) {
  if (!runtime || typeof runtime !== "object" || Array.isArray(runtime) ||
      Buffer.byteLength(JSON.stringify(runtime), "utf8") > RUNTIME_LIMIT) {
    throw new Error("Invalid native runtime descriptor");
  }
  return getEncryptedStore().encrypt(runtime, binding(lease, "runtime_ciphertext"));
}

async function decryptRuntime(lease: NativeConnectionLease, ciphertext: string) {
  const store = getEncryptedStore();
  const value = store.fromDatabase<Record<string, unknown>>(ciphertext);
  if (store.formatOf(value) !== 3) throw new Error("Invalid native runtime envelope");
  const runtime = await store.decrypt(value, binding(lease, "runtime_ciphertext"));
  if (!runtime || typeof runtime !== "object" || Array.isArray(runtime)) {
    throw new Error("Invalid native runtime descriptor");
  }
  return runtime;
}

function asLease(row: StoredConnection): NativeConnectionLease {
  if (!row.lease_id || !row.lease_kind || !row.lease_expires_at) throw new Error("Missing native connection lease");
  return { connectionId: row.id, userId: row.user_id, engine: row.engine,
    generation: row.generation, revision: row.revision, leaseId: row.lease_id,
    kind: row.lease_kind, leaseExpiresAt: row.lease_expires_at,
    ...(row.worker_run_id ? { workerRunId: row.worker_run_id } : {}),
    ...(row.worker_allocation_id ? { workerAllocationId: row.worker_allocation_id } : {}) };
}

function fence(lease: NativeConnectionLease) {
  return { p_id: lease.connectionId, p_user_id: lease.userId, p_engine: lease.engine,
    p_generation: lease.generation, p_lease_id: lease.leaseId, p_revision: lease.revision };
}

async function call(name: string, args: Record<string, unknown>): Promise<StoredConnection> {
  const { data, error } = await getServiceClient().rpc(name, args).single();
  if (error || !data) throw new Error("Native connection operation rejected");
  return data as StoredConnection;
}

export async function listNativeConnections(userId: string): Promise<NativeConnectionMetadata[]> {
  if (!userId) throw new Error("Native credential owner is required");
  const { data, error } = await getServiceClient().from("native_agent_connections")
    .select("id,engine,status,generation,revision,lease_id,lease_kind,lease_expires_at,updated_at")
    .eq("user_id", userId);
  if (error) throw new Error("Unable to load native connection metadata");
  return ((data ?? []) as StoredConnection[]).map((row) => ({ id: row.id, engine: row.engine,
    status: row.status, generation: row.generation, revision: row.revision,
    busy: row.lease_id !== null,
    stopRequired: row.lease_kind === "stop" ||
      (row.lease_id !== null && Date.parse(row.lease_expires_at ?? "") <= Date.now()),
    updatedAt: row.updated_at }));
}

export async function acquireNativeConnection(userId: string, engine: NativeHarness,
  kind: "login" | "test"): Promise<NativeConnectionLease> {
  assertEngine(engine);
  if (!userId || !["login", "test"].includes(kind)) throw new Error("Invalid native connection request");
  return asLease(await call("acquire_native_agent_connection", { p_user_id: userId, p_engine: engine, p_kind: kind }));
}

export async function getNativeConnectionLease(userId: string, engine: NativeHarness): Promise<NativeConnectionLease | null> {
  assertEngine(engine);
  if (!userId) throw new Error("Native credential owner is required");
  const { data, error } = await getServiceClient().from("native_agent_connections")
    .select("id,user_id,engine,generation,revision,lease_id,lease_kind,lease_expires_at,worker_run_id,worker_allocation_id")
    .eq("user_id", userId).eq("engine", engine).maybeSingle();
  if (error) throw new Error("Unable to load native connection lease");
  const row = data as StoredConnection | null;
  return row?.lease_id ? asLease(row) : null;
}

/** Drain abandoned runtimes without selecting credential or controller ciphertext. */
export async function listNativeCleanupCandidates(limit = 8): Promise<Array<{ userId: string; engine: NativeHarness }>> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 32) throw new Error("Invalid native cleanup batch limit");
  const { data, error } = await getServiceClient().from("native_agent_connections")
    .select("user_id,engine").not("lease_id", "is", null)
    .or(`lease_kind.eq.stop,lease_expires_at.lte.${new Date().toISOString()}`)
    .order("updated_at", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to enumerate native cleanup metadata");
  return ((data ?? []) as Array<{ user_id: string; engine: NativeHarness }>)
    .map((row) => ({ userId: row.user_id, engine: row.engine }));
}

export async function loadNativeProfile(lease: NativeConnectionLease): Promise<NativeCredentialProfile | null> {
  const row = await call("read_native_agent_connection", { ...fence(lease), p_runtime: false });
  return row.profile_ciphertext ? decryptNativeProfile(lease, row.profile_ciphertext) : null;
}

/** A busy account returns no lease; every other admission failure remains an error. */
export async function acquireNativeWorkerConnection(runId: string): Promise<NativeConnectionLease | null> {
  if (!runId) throw new Error("Native worker run is required");
  const { data, error } = await getServiceClient().rpc("acquire_native_worker_connection", { p_run_id: runId }).maybeSingle();
  if (error) throw new Error("Native worker admission rejected");
  return data ? asLease(data as StoredConnection) : null;
}

export async function bindNativeWorkerConnection(lease: NativeConnectionLease, allocationId: string): Promise<void> {
  const row = await call("bind_native_worker_allocation", { ...fence(lease), p_allocation_id: allocationId });
  lease.revision = row.revision;
  lease.workerAllocationId = row.worker_allocation_id ?? undefined;
}

/** Worker lookup returns metadata only, even when cleanup bypasses live run authority. */
export async function getNativeWorkerConnection(runId: string, sandboxName?: string,
  options: { execution?: boolean } = { execution: true }): Promise<NativeConnectionLease | null> {
  const { data, error } = await getServiceClient().rpc("get_native_worker_connection", {
    p_run_id: runId, p_sandbox_name: sandboxName ?? null, p_execution: options.execution !== false,
  }).maybeSingle();
  if (error) throw new Error("Native worker authority rejected");
  return data ? asLease(data as StoredConnection) : null;
}

export async function renewNativeWorkerLease(lease: NativeConnectionLease): Promise<void> {
  const row = await call("renew_native_worker_connection", fence(lease));
  lease.leaseExpiresAt = row.lease_expires_at!;
}

/** Pre-injection failure retires execution while preserving the connected profile. */
export async function stopNativeWorkerLease(lease: NativeConnectionLease): Promise<NativeConnectionLease> {
  return asLease(await call("stop_native_worker_connection", fence(lease)));
}

export async function saveNativeProfile(lease: NativeConnectionLease, profile: NativeCredentialProfile): Promise<void> {
  const ciphertext = await encryptNativeProfile(lease, profile);
  const row = await call("write_native_agent_connection", { ...fence(lease), p_runtime: false, p_ciphertext: ciphertext });
  lease.revision = row.revision;
}

export async function setNativeRuntime(lease: NativeConnectionLease, runtime: Record<string, unknown> | null): Promise<void> {
  const ciphertext = runtime === null ? null : await encryptRuntime(lease, runtime);
  const row = await call("write_native_agent_connection", { ...fence(lease), p_runtime: true, p_ciphertext: ciphertext });
  lease.revision = row.revision;
}

export async function getNativeRuntime(lease: NativeConnectionLease,
  options: { execution?: boolean } = {}): Promise<Record<string, unknown> | null> {
  const row = await call("read_native_agent_connection", { ...fence(lease), p_runtime: true,
    ...(options.execution ? { p_execution: true } : {}) });
  return row.runtime_ciphertext ? decryptRuntime(lease, row.runtime_ciphertext) : null;
}

/** A lease remains claimed after its deadline until the orchestrator confirms process termination. */
export async function releaseNativeConnection(lease: NativeConnectionLease,
  confirmation: { stopped: true }): Promise<void> {
  if (confirmation?.stopped !== true) throw new Error("Native process stop confirmation is required");
  const row = await call("release_native_agent_connection", fence(lease));
  lease.revision = row.revision;
}

export async function disconnectNativeConnection(userId: string, engine: NativeHarness,
  expected?: NativeConnectionLease): Promise<{
  lease: NativeConnectionLease | null; runtime: Record<string, unknown> | null;
}> {
  assertEngine(engine);
  if (!userId) throw new Error("Native credential owner is required");
  if (expected && (expected.userId !== userId || expected.engine !== engine)) {
    throw new Error("Native disconnect owner mismatch");
  }
  const row = await call("disconnect_native_agent_connection", { p_user_id: userId, p_engine: engine,
    ...(expected ? { p_expected_lease_id: expected.leaseId, p_expected_generation: expected.generation } : {}) });
  const lease = row.lease_id ? asLease(row) : null;
  return { lease, runtime: lease && row.runtime_ciphertext ? await decryptRuntime(lease, row.runtime_ciphertext) : null };
}
