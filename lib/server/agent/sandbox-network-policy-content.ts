import "server-only";

import type { NetworkPolicy } from "@vercel/sandbox";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

function binding(projectId: string, sandboxName: string, sessionId: string) {
  if (!projectId || !sandboxName || !sessionId) throw new Error("Sandbox policy binding is required");
  return {
    scope: { kind: "project" as const, id: projectId },
    table: "agent_sandbox_allocations", column: "network_policy",
    rowId: `${sandboxName}:${sessionId}`,
  };
}

/** Carry the desired policy through the VM as ciphertext, never as credentials.
 * Vercel redacts injected headers on readback, so they cannot be copied safely. */
export async function sealSandboxNetworkPolicy(
  projectId: string, sandboxName: string, sessionId: string, policy: NetworkPolicy,
): Promise<string> {
  return getEncryptedStore().encrypt(policy, binding(projectId, sandboxName, sessionId));
}

/** Only the same project's live allocation can recover its original policy. */
export async function openSandboxNetworkPolicy(
  projectId: string, sandboxName: string, sessionId: string, ciphertext: string,
): Promise<NetworkPolicy> {
  if (!ciphertext || ciphertext.length > 65_536) throw new Error("Invalid sandbox policy refresh context");
  const store = getEncryptedStore();
  return store.decrypt(store.fromDatabase<NetworkPolicy>(ciphertext),
    binding(projectId, sandboxName, sessionId));
}
