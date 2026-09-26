import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

type StoredTitle = {
  project_id: string;
  conversation_id?: string;
  id: string;
  title: string | null;
  title_ciphertext?: string | null;
  title_encryption_version?: number;
};

export function legacyAgentTitleSchema(error: { code?: string } | null): boolean {
  return process.env.MINDDY_AGENT_TITLE_ENCRYPTION_ENABLED !== "true" &&
    (error?.code === "42703" || error?.code === "PGRST204");
}

function binding(projectId: string, conversationId: string) {
  if (!projectId || !conversationId) throw new Error("Agent title scope is required");
  return { scope: { kind: "project" as const, id: projectId },
    table: "agent_conversations", column: "title", rowId: conversationId };
}

export async function shouldEncryptAgentTitle(service: SupabaseClient, projectId: string) {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_AGENT_TITLE_ENCRYPTION_ENABLED === "true") return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await service.from("agent_title_encryption_scopes")
    .select("project_id").eq("project_id", projectId).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve agent title encryption state");
  }
  return !!data;
}

export async function encodeAgentTitle(
  projectId: string, conversationId: string, title: string | null,
) {
  const store = getEncryptedStore();
  const cipher = await store.encrypt(title, binding(projectId, conversationId));
  return { title: null, title_ciphertext: cipher,
    title_encryption_version: store.versionOf(cipher) };
}

export async function decodeAgentTitle<T extends StoredTitle>(
  row: T, actorId: string | null = null,
): Promise<T> {
  const version = row.title_encryption_version ?? 0;
  if (version === 0) {
    if (row.title_ciphertext != null) throw new Error("Invalid legacy agent title");
    return row;
  }
  if (!Number.isSafeInteger(version) || version < 1 || row.title !== null ||
      typeof row.title_ciphertext !== "string") {
    throw new Error("Invalid encrypted agent title");
  }
  const context = binding(row.project_id, row.conversation_id ?? row.id);
  const store = getEncryptedStore();
  const encrypted = store.fromDatabase<string | null>(row.title_ciphertext);
  if (store.versionOf(encrypted) !== version) throw new Error("Agent title key version mismatch");
  const title = await store.decrypt(encrypted, context);
  if (title !== null && (typeof title !== "string" || title.length > 200)) {
    throw new Error("Invalid agent title content");
  }
  auditDecryption(context, { actorId, reason: "repository_read" });
  return { ...row, title };
}
