import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { parseAgentDelegationResult, type AgentDelegationResult } from "./agent-contract";
import { shouldEncryptAgentWorkBranch } from "./run-work-branch-content";

export type StoredDelegationResult = { id: string; project_id: string;
  delegation_result?: AgentDelegationResult | null;
  delegation_result_ciphertext?: string | null;
  delegation_result_encryption_version?: number };

function binding(projectId: string, runId: string) {
  if (!projectId || !runId) throw new Error("Delegation result scope is required");
  return { scope: { kind: "project" as const, id: projectId },
    table: "agent_runs", column: "delegation_result", rowId: runId };
}

export async function shouldEncryptDelegationResult(service: SupabaseClient,
  projectId: string): Promise<boolean> {
  if (isContentEncryptionEnabled()) return true;
  if (await shouldEncryptAgentWorkBranch(service, projectId)) return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await service.from("agent_result_encryption_scopes")
    .select("project_id").eq("project_id", projectId).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve delegation result encryption state");
  }
  return !!data;
}

export async function encodeDelegationResult(projectId: string, runId: string,
  value: AgentDelegationResult) {
  const result = parseAgentDelegationResult(value);
  const store = getEncryptedStore();
  const cipher = await store.encrypt(result, binding(projectId, runId));
  return { delegation_result: null, delegation_result_ciphertext: cipher,
    delegation_result_encryption_version: store.versionOf(cipher) };
}

export async function decodeDelegationResult<T extends StoredDelegationResult>(row: T,
  actorId: string | null = null): Promise<T> {
  const version = row.delegation_result_encryption_version ?? 0;
  if (version === 0) {
    if (row.delegation_result_ciphertext != null) throw new Error("Invalid legacy delegation result");
    return row;
  }
  if (!Number.isSafeInteger(version) || version < 1 || row.delegation_result != null ||
      typeof row.delegation_result_ciphertext !== "string") {
    throw new Error("Invalid encrypted delegation result");
  }
  const context = binding(row.project_id, row.id);
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<AgentDelegationResult>(row.delegation_result_ciphertext);
  if (store.versionOf(cipher) !== version) throw new Error("Delegation result key version mismatch");
  const result = parseAgentDelegationResult(await store.decrypt(cipher, context));
  auditDecryption(context, { actorId, reason: "repository_read" });
  return { ...row, delegation_result: result };
}
