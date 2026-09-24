import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentCheckpoint } from "./runs";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

type StoredCheckpoint = { id: string; project_id: string;
  checkpoint: AgentCheckpoint | null;
  checkpoint_ciphertext?: string | null;
  checkpoint_encryption_version?: number };

function binding(projectId: string, runId: string) {
  if (!projectId || !runId) throw new Error("Agent checkpoint scope is required");
  return { scope: { kind: "project" as const, id: projectId },
    table: "agent_runs", column: "checkpoint", rowId: runId };
}

export async function shouldEncryptAgentCheckpoint(service: SupabaseClient, projectId: string) {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_AGENT_CHECKPOINT_ENCRYPTION_ENABLED === "true") return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await service.from("agent_checkpoint_encryption_scopes")
    .select("project_id").eq("project_id", projectId).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve agent checkpoint encryption state");
  }
  return !!data;
}

export async function encodeAgentCheckpoint(projectId: string, runId: string,
  checkpoint: AgentCheckpoint | null) {
  if (checkpoint == null) return { checkpoint: null, checkpoint_ciphertext: null,
    checkpoint_encryption_version: 0 };
  const store = getEncryptedStore();
  const cipher = await store.encrypt(checkpoint, binding(projectId, runId));
  return { checkpoint: null, checkpoint_ciphertext: cipher,
    checkpoint_encryption_version: store.versionOf(cipher) };
}

export async function decodeAgentCheckpoint<T extends StoredCheckpoint>(
  row: T, actorId: string | null = null,
): Promise<T> {
  const version = row.checkpoint_encryption_version ?? 0;
  if (version === 0) {
    if (row.checkpoint_ciphertext != null) throw new Error("Invalid legacy agent checkpoint");
    return row;
  }
  if (!Number.isSafeInteger(version) || version < 1 || row.checkpoint !== null ||
      typeof row.checkpoint_ciphertext !== "string") {
    throw new Error("Invalid encrypted agent checkpoint");
  }
  const context = binding(row.project_id, row.id);
  const store = getEncryptedStore();
  const encrypted = store.fromDatabase<AgentCheckpoint>(row.checkpoint_ciphertext);
  if (store.versionOf(encrypted) !== version) throw new Error("Agent checkpoint key version mismatch");
  const checkpoint = await store.decrypt(encrypted, context);
  if (!checkpoint || typeof checkpoint !== "object" || Array.isArray(checkpoint)) {
    throw new Error("Invalid agent checkpoint content");
  }
  auditDecryption(context, { actorId, reason: "repository_read" });
  return { ...row, checkpoint };
}
