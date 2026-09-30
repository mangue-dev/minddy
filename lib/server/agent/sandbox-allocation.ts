import "server-only";
import { randomUUID } from "node:crypto";

import { getServiceClient } from "@/lib/supabase-service";
import { agentSandboxName } from "./network-policy";
import { deleteSandboxByName, getOrCreateAgentSandbox } from "./sandbox";
import { mintRunKey, revokeRunKeyStrict, runKeyMintingEnabled } from "./run-key";

export interface SandboxAllocation {
  id: string;
  sandbox_name: string;
  provider_key_id: string | null;
  provider_pending: boolean;
  key_request_pending?: boolean;
  state: "reserved" | "attached" | "revoked" | "cleaned";
  providerRequestStarted?: boolean;
  providerRequestSettled?: boolean;
}

async function allocationRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await getServiceClient().rpc(name, args);
  if (error) throw new Error("agent_allocation_coordination_failed");
  return data;
}

/** The reservation outlives run/account cascades and every external request. */
export async function reserveSandboxAllocation(runId: string): Promise<SandboxAllocation> {
  const previous = await allocationRpc("retire_previous_agent_allocations", { p_run_id: runId });
  if (!Array.isArray(previous)) throw new Error("agent_allocation_enumeration_failed");
  for (const allocation of previous as SandboxAllocation[]) await cleanupSandboxAllocation(allocation);
  const sandboxName = `${agentSandboxName(runId)}-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const id = await allocationRpc("reserve_agent_sandbox_allocation", {
    p_run_id: runId, p_sandbox_name: sandboxName,
  });
  if (typeof id !== "string") throw new Error("agent_allocation_refused");
  return { id, sandbox_name: sandboxName, provider_key_id: null, provider_pending: true, state: "reserved", providerRequestStarted: false };
}

export async function recordAllocationKey(allocation: SandboxAllocation, key: string): Promise<void> {
  allocation.provider_key_id = key;
  const accepted = await allocationRpc("record_agent_allocation_key", { p_id: allocation.id, p_key_id: key });
  if (accepted !== true) throw new Error("agent_allocation_revoked");
  allocation.key_request_pending = false;
}

export async function beginAllocationKeyRequest(allocation: SandboxAllocation): Promise<void> {
  if (await allocationRpc("begin_agent_allocation_key_request", { p_id: allocation.id }) !== true) {
    throw new Error("agent_allocation_revoked");
  }
  allocation.key_request_pending = true;
}

export async function mintAllocationRunKey(allocation: SandboxAllocation, opts: Parameters<typeof mintRunKey>[0]) {
  const contacted = runKeyMintingEnabled();
  if (contacted) await beginAllocationKeyRequest(allocation);
  const minted = await mintRunKey(opts);
  if (contacted && !minted) throw new Error("agent_key_provisioning_outcome_unknown");
  if (minted) await recordAllocationKey(allocation, minted.hash);
  return minted;
}

/** An unknown provider outcome cannot be settled by a timeout, retry or 404. */
export async function cleanupSandboxAllocation(allocation: SandboxAllocation): Promise<void> {
  if (allocation.state !== "cleaned") {
    if (await allocationRpc("revoke_agent_sandbox_allocation", { p_id: allocation.id }) !== true) {
      throw new Error("agent_allocation_revocation_unconfirmed");
    }
    allocation.state = "revoked";
  }
  if (allocation.provider_pending && allocation.providerRequestStarted !== false && !allocation.providerRequestSettled) {
    if (allocation.provider_key_id) await revokeRunKeyStrict(allocation.provider_key_id);
    throw new Error("agent_allocation_provider_outcome_unknown");
  }
  await allocationRpc("settle_agent_sandbox_allocation", { p_id: allocation.id });
  allocation.provider_pending = false;
  await deleteSandboxByName(allocation.sandbox_name);
  if (allocation.provider_key_id) {
    await revokeRunKeyStrict(allocation.provider_key_id);
    if (await allocationRpc("confirm_agent_allocation_key_revoked", { p_id: allocation.id, p_key_id: allocation.provider_key_id }) !== true) {
      throw new Error("agent_key_revocation_unconfirmed");
    }
    allocation.key_request_pending = false;
  }
  if (allocation.key_request_pending) throw new Error("agent_key_provisioning_outcome_unknown");
  if (await allocationRpc("complete_agent_allocation_cleanup", { p_id: allocation.id }) !== true) {
    throw new Error("agent_allocation_cleanup_unconfirmed");
  }
  allocation.state = "cleaned";
}

export async function allocateReservedSandbox(
  allocation: SandboxAllocation,
  opts: Parameters<typeof getOrCreateAgentSandbox>[0],
): ReturnType<typeof getOrCreateAgentSandbox> {
  if (opts.name !== allocation.sandbox_name) throw new Error("agent_allocation_name_mismatch");
  const attach = async () => {
    if (await allocationRpc("attach_agent_sandbox_allocation", { p_id: allocation.id }) !== true) {
      throw new Error("agent_allocation_revoked");
    }
  };
  let bootstrapError: unknown;
  try {
    allocation.providerRequestStarted = true;
    const result = await getOrCreateAgentSandbox({ ...opts, onCreate: async (sandbox) => {
      // Register the physical allocation before any private repository is cloned.
      try {
        await attach();
        await opts.onCreate(sandbox);
      } catch (error) {
        // Let the provider finish its request so deletion cannot race creation.
        bootstrapError = error;
      }
    } });
    allocation.providerRequestSettled = true;
    await allocationRpc("settle_agent_sandbox_allocation", { p_id: allocation.id });
    allocation.provider_pending = false;
    if (bootstrapError) throw bootstrapError;
    await attach();
    allocation.state = "attached";
    return result;
  } catch (error) {
    await cleanupSandboxAllocation(allocation);
    throw error;
  }
}

/** Revoked unresolved requests block erasure even if provider deletion returned 404. */
export async function eraseSandboxAllocations(scope: "project" | "account", scopeId: string): Promise<void> {
  const rows = await allocationRpc("revoke_agent_sandbox_allocations", { p_scope: scope, p_scope_id: scopeId });
  if (!Array.isArray(rows)) throw new Error("agent_allocation_enumeration_failed");
  let unresolved = false;
  for (const allocation of rows as SandboxAllocation[]) {
    if (allocation.provider_pending) {
      // Sweep the deterministic identity without treating absence as settlement.
      await deleteSandboxByName(allocation.sandbox_name);
      if (allocation.provider_key_id) await revokeRunKeyStrict(allocation.provider_key_id);
      unresolved = true;
      continue;
    }
    await cleanupSandboxAllocation(allocation);
  }
  if (unresolved) throw new Error("agent_allocation_in_flight; retry erasure after allocation cleanup");
  if (await allocationRpc("agent_allocation_erasure_complete", { p_scope: scope, p_scope_id: scopeId }) !== true) {
    throw new Error("agent_allocation_erasure_incomplete");
  }
}

export async function retryRevokedSandboxAllocations(): Promise<void> {
  const rows = await allocationRpc("next_agent_allocation_cleanup_batch", { p_limit: 25 });
  if (!Array.isArray(rows)) throw new Error("agent_allocation_enumeration_failed");
  for (const allocation of rows as SandboxAllocation[]) {
    try {
      if (allocation.provider_pending) {
        await deleteSandboxByName(allocation.sandbox_name);
        if (allocation.provider_key_id) await revokeRunKeyStrict(allocation.provider_key_id);
      } else {
        await cleanupSandboxAllocation(allocation);
      }
    } catch {
      console.error("[agent-allocation] cleanup_retry_failed", allocation.id);
    }
  }
}
