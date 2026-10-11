import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { nativeWorkerPaths } from "@/lib/native-agent-worker";
import { cloudLayout } from "./harness-layout";
import type { AgentSandbox } from "./sandbox";
import { cleanupSandboxAllocation, type SandboxAllocation } from "./sandbox-allocation";
import {
  acquireNativeWorkerConnection, bindNativeWorkerConnection, disconnectNativeConnection,
  getNativeRuntime, getNativeWorkerConnection, loadNativeProfile, releaseNativeConnection,
  renewNativeWorkerLease, commitNativeWorkerProfile, setNativeRuntime, validateNativeProfile,
  stopNativeWorkerLease,
  type NativeConnectionLease,
} from "./native-agent-credentials";

type WorkerRuntime = { kind: "worker"; runId: string; allocationId: string; sandboxName: string;
  profileImported: boolean; profileSaved: boolean };

function descriptor(value: Record<string, unknown> | null, lease: NativeConnectionLease): WorkerRuntime {
  const result = value as WorkerRuntime | null;
  if (!result || result.kind !== "worker" || result.runId !== lease.workerRunId ||
    result.allocationId !== lease.workerAllocationId || typeof result.sandboxName !== "string" ||
    typeof result.profileImported !== "boolean" || typeof result.profileSaved !== "boolean") {
    throw new Error("Native worker runtime invalid");
  }
  return result;
}

export const claimNativeWorkerConnection = acquireNativeWorkerConnection;

/** Persist the exact allocation before credentials or native processes can enter it. */
export async function bindNativeWorkerAllocation(lease: NativeConnectionLease, allocation: SandboxAllocation) {
  if (lease.kind !== "worker" || !lease.workerRunId) throw new Error("Native worker lease required");
  await bindNativeWorkerConnection(lease, allocation.id);
  await setNativeRuntime(lease, { kind: "worker", runId: lease.workerRunId,
    allocationId: allocation.id, sandboxName: allocation.sandbox_name, profileImported: false, profileSaved: false });
}

/** No profile or provider credentials are carried by the worker job or control plane. */
export async function restoreNativeWorkerProfile(lease: NativeConnectionLease, sandbox: AgentSandbox) {
  const current = await assertNativeWorkerAuthority(lease.workerRunId!, sandbox.name);
  if (current.leaseId !== lease.leaseId || current.generation !== lease.generation) throw new Error("Native worker lease superseded");
  const active = descriptor(await getNativeRuntime(lease, { execution: true }), lease);
  const profile = await loadNativeProfile(lease);
  if (!profile) throw new Error("Native subscription reconnection required");
  const layout = cloudLayout();
  const paths = nativeWorkerPaths(layout);
  // A fresh repository allocation has no harness directory until VM launch.
  // Credential restore precedes that launch, so create its parent explicitly.
  // The provider SDK mkdir rejects an existing directory; restores can encounter
  // a harness directory already created by trusted bootstrap or an earlier step.
  const prepared = await sandbox.runCommand({ cmd: "mkdir", args: ["-p", "--", layout.harnessDir, paths.privateRoot] });
  if (prepared.exitCode !== 0) throw new Error("Native private directory unavailable");
  const directory = await sandbox.runCommand({ cmd: "chmod", args: ["0700", "--", paths.privateRoot] });
  if (directory.exitCode !== 0) throw new Error("Native private directory unavailable");
  // Mark injection before the external write: a lost response is not proof that
  // credentials never reached a native process that could rotate them.
  active.profileImported = true;
  await setNativeRuntime(lease, active);
  try { await sandbox.writeFiles([{ path: paths.profileImportPath, content: JSON.stringify(profile) }]); }
  catch { throw new Error("Native profile injection unavailable"); }
  const file = await sandbox.runCommand({ cmd: "chmod", args: ["0600", "--", paths.profileImportPath] });
  if (file.exitCode !== 0) throw new Error("Native private profile permissions unavailable");
}

export async function assertNativeWorkerAuthority(runId: string, sandboxName: string): Promise<NativeConnectionLease> {
  const lease = await getNativeWorkerConnection(runId, sandboxName);
  if (!lease || lease.kind !== "worker") throw new Error("Native worker authority unavailable");
  return lease;
}

export async function renewNativeWorkerConnection(runId: string, sandboxName: string) {
  await renewNativeWorkerLease(await assertNativeWorkerAuthority(runId, sandboxName));
}

/** Called only after the isolated supervisor has stopped its native child. */
export async function finalizeNativeWorkerConnection(runId: string, sandbox: AgentSandbox) {
  const lease = await assertNativeWorkerAuthority(runId, sandbox.name);
  const active = descriptor(await getNativeRuntime(lease, { execution: true }), lease);
  if (!active.profileImported) throw new Error("Native profile was not imported");
  if (active.profileSaved) return;
  let exported: Buffer | null;
  try { exported = await sandbox.readFileToBuffer({ path: nativeWorkerPaths(cloudLayout()).profileExportPath }); }
  catch { throw new Error("Native profile export unavailable"); }
  if (!exported || exported.byteLength > 64 * 1024) throw new Error("Native profile export unavailable");
  let parsed: unknown;
  try { parsed = JSON.parse(exported.toString("utf8")); }
  catch { throw new Error("Native profile export invalid"); }
  await commitNativeWorkerProfile(lease, validateNativeProfile(parsed, lease.engine), { ...active, profileSaved: true });
}

async function workerAllocation(lease: NativeConnectionLease): Promise<SandboxAllocation | null> {
  const { data, error } = await getServiceClient().rpc("get_native_worker_allocation", {
    p_id: lease.connectionId, p_user_id: lease.userId, p_engine: lease.engine,
    p_generation: lease.generation, p_lease_id: lease.leaseId, p_revision: lease.revision,
  }).maybeSingle();
  if (error) throw new Error("Native worker cleanup authority unavailable");
  return data as SandboxAllocation | null;
}

function sameAuthority(current: NativeConnectionLease, expected: NativeConnectionLease) {
  return current.connectionId === expected.connectionId && current.generation === expected.generation &&
    current.leaseId === expected.leaseId && (!expected.workerAllocationId || current.workerAllocationId === expected.workerAllocationId);
}

/** A stale watchdog snapshot must never retire a replacement physical allocation. */
export async function getNativeWorkerCleanupLease(runId: string, sandboxName: string): Promise<NativeConnectionLease | null> {
  const lease = await getNativeWorkerConnection(runId, undefined, { execution: false });
  if (!lease) return null;
  const allocation = await workerAllocation(lease);
  return allocation?.sandbox_name === sandboxName ? lease : null;
}

/** Cleanup authority survives disconnect, feature changes and deleted run rows. */
export async function cleanupNativeWorkerLease(lease: NativeConnectionLease) {
  if (!lease.workerRunId) throw new Error("Native worker lease required");
  const allocation = await workerAllocation(lease);
  if (allocation) await cleanupSandboxAllocation(allocation);
  await releaseNativeConnection(lease, { stopped: true });
}

/** Healthy turn teardown preserves the profile saved before the report lands. */
export async function releaseNativeWorkerConnection(runId: string, confirmation: { stopped: true }, expected?: NativeConnectionLease) {
  if (confirmation?.stopped !== true) throw new Error("Native child stop confirmation required");
  const lease = await getNativeWorkerConnection(runId, undefined, { execution: false });
  if (!lease) return;
  if (expected && !sameAuthority(lease, expected)) return;
  const value = await getNativeRuntime(lease);
  const active = value ? descriptor(value, lease) : null;
  if (lease.kind === "worker" && active?.profileImported && !active.profileSaved) {
    await abortNativeWorkerConnection(runId, lease);
    return;
  }
  await cleanupNativeWorkerLease(lease);
}

/** Failed or ambiguous native turns cannot silently reuse an earlier auth file. */
export async function abortNativeWorkerConnection(runId: string, expected?: NativeConnectionLease) {
  const lease = await getNativeWorkerConnection(runId, undefined, { execution: false });
  if (!lease) return;
  if (expected && !sameAuthority(lease, expected)) return;
  if (lease.workerRunId !== runId) throw new Error("Native worker run mismatch");
  const value = await getNativeRuntime(lease);
  const active = value ? descriptor(value, lease) : null;
  if (!active?.profileImported || active.profileSaved) {
    await cleanupNativeWorkerLease(await stopNativeWorkerLease(lease));
  } else {
    const stopped = await disconnectNativeConnection(lease.userId, lease.engine, lease);
    if (stopped.lease) await cleanupNativeWorkerLease(stopped.lease);
  }
}
