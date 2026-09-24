import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

export type StoredAgentContext = {
  id?: string;
  conversation_id: string;
  kind: string;
  resource_id: string;
  snapshot: Record<string, unknown>;
  snapshot_ciphertext?: string | null;
  snapshot_encryption_version?: number;
};

export function legacyAgentContextSchema(error: { code?: string } | null): boolean {
  return process.env.MINDDY_AGENT_CONTEXT_ENCRYPTION_ENABLED !== "true" &&
    (error?.code === "42703" || error?.code === "PGRST204");
}

function binding(projectId: string, row: StoredAgentContext) {
  if (!projectId || !row.conversation_id || !row.kind || !row.resource_id) {
    throw new Error("Agent context scope is required");
  }
  return { scope: { kind: "project" as const, id: projectId },
    table: "agent_conversation_contexts", column: "snapshot",
    rowId: `${row.conversation_id}:${row.kind}:${row.resource_id}` };
}

export async function shouldEncryptAgentContext(service: SupabaseClient, projectId: string) {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_AGENT_CONTEXT_ENCRYPTION_ENABLED === "true") return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await service.from("agent_context_encryption_scopes")
    .select("project_id").eq("project_id", projectId).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve agent context encryption state");
  }
  return !!data;
}

export async function encodeAgentContextSnapshot(projectId: string,
  row: StoredAgentContext) {
  if (!row.snapshot || typeof row.snapshot !== "object" || Array.isArray(row.snapshot)) {
    throw new Error("Invalid agent context snapshot");
  }
  const store = getEncryptedStore();
  const cipher = await store.encrypt(row.snapshot, binding(projectId, row));
  return { snapshot: {} as Record<string, unknown>, snapshot_ciphertext: cipher,
    snapshot_encryption_version: store.versionOf(cipher) };
}

export async function decodeAgentContextSnapshot<T extends StoredAgentContext>(
  projectId: string, row: T, actorId: string | null = null,
): Promise<T> {
  const version = row.snapshot_encryption_version ?? 0;
  if (version === 0) {
    if (row.snapshot_ciphertext != null) throw new Error("Invalid legacy agent context");
    return row;
  }
  if (!Number.isSafeInteger(version) || version < 1 ||
      Object.keys(row.snapshot ?? {}).length !== 0 ||
      typeof row.snapshot_ciphertext !== "string") {
    throw new Error("Invalid encrypted agent context");
  }
  const context = binding(projectId, row);
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<Record<string, unknown>>(row.snapshot_ciphertext);
  if (store.versionOf(cipher) !== version) throw new Error("Agent context key version mismatch");
  const snapshot = await store.decrypt(cipher, context);
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("Invalid agent context snapshot");
  }
  auditDecryption(context, { actorId, reason: "repository_read" });
  return { ...row, snapshot };
}
