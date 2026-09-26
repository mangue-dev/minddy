import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttachmentInput } from "@/lib/types";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { parseAgentDelegationBrief, type AgentDelegationBrief } from "./agent-contract";

type DelegationInput = { delegation_brief: AgentDelegationBrief;
  delegation_attachments: AttachmentInput[] };
type StoredDelegation = { id: string; project_id: string;
  delegation_brief?: AgentDelegationBrief | null;
  delegation_attachments?: AttachmentInput[] | null;
  encrypted_delegation_input?: string | null;
  delegation_encryption_version?: number };

function binding(projectId: string, runId: string) {
  if (!projectId || !runId) throw new Error("Agent delegation scope is required");
  return { scope: { kind: "project" as const, id: projectId },
    table: "agent_runs", column: "delegation_input", rowId: runId };
}

export async function shouldEncryptAgentDelegation(service: SupabaseClient, projectId: string) {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_AGENT_DELEGATION_ENCRYPTION_ENABLED === "true") return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await service.from("agent_delegation_encryption_scopes")
    .select("project_id").eq("project_id", projectId).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve agent delegation encryption state");
  }
  return !!data;
}

export async function encodeAgentDelegationInput(projectId: string, runId: string,
  value: DelegationInput) {
  const store = getEncryptedStore();
  const cipher = await store.encrypt(value, binding(projectId, runId));
  return { delegation_brief: null, delegation_attachments: [] as AttachmentInput[],
    encrypted_delegation_input: cipher, delegation_encryption_version: store.versionOf(cipher) };
}

export async function decodeAgentDelegationInput<T extends StoredDelegation>(
  row: T, actorId: string | null = null,
): Promise<T> {
  const version = row.delegation_encryption_version ?? 0;
  if (version === 0) {
    if (row.encrypted_delegation_input != null) throw new Error("Invalid legacy agent delegation");
    return row;
  }
  if (!Number.isSafeInteger(version) || version < 1 || row.delegation_brief != null ||
      (row.delegation_attachments?.length ?? 0) !== 0 ||
      typeof row.encrypted_delegation_input !== "string") {
    throw new Error("Invalid encrypted agent delegation");
  }
  const context = binding(row.project_id, row.id);
  const store = getEncryptedStore();
  const encrypted = store.fromDatabase<DelegationInput>(row.encrypted_delegation_input);
  if (store.versionOf(encrypted) !== version) throw new Error("Agent delegation key version mismatch");
  const value = await store.decrypt(encrypted, context);
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !Array.isArray(value.delegation_attachments)) {
    throw new Error("Invalid agent delegation content");
  }
  const brief = parseAgentDelegationBrief(value.delegation_brief);
  auditDecryption(context, { actorId, reason: "repository_read" });
  return { ...row, delegation_brief: brief,
    delegation_attachments: value.delegation_attachments };
}
