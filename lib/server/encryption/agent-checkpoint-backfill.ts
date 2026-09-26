import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeAgentCheckpoint, encodeAgentCheckpoint } from "@/lib/server/agent/run-checkpoint-content";
import type { AgentCheckpoint } from "@/lib/server/agent/runs";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys, getEncryptedStore } from "./registry";

type StoredCheckpoint = { id: string; project_id: string; conversation_id: string;
  checkpoint: AgentCheckpoint | null; checkpoint_ciphertext: string | null;
  checkpoint_encryption_version: number };

/** Convert a bounded set of run checkpoints and their current runtime copies. */
export async function backfillAgentCheckpointBatch(limit = 5, signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_AGENT_CHECKPOINT_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Agent checkpoint encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
    throw new Error("Invalid agent checkpoint batch size");
  }
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("agent_runs")
    .select("id,project_id,conversation_id,checkpoint,checkpoint_ciphertext,checkpoint_encryption_version")
    .order("checkpoint_encryption_checked_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan agent checkpoints");
  for (const row of (data ?? []) as StoredCheckpoint[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      if (!row.id || !row.project_id || !row.conversation_id ||
          !Number.isSafeInteger(row.checkpoint_encryption_version) ||
          row.checkpoint_encryption_version < 0) {
        throw new Error("Invalid agent checkpoint migration metadata");
      }
      const identity = { p_id: row.id, p_project_id: row.project_id,
        p_conversation_id: row.conversation_id,
        p_old_checkpoint: row.checkpoint, p_old_cipher: row.checkpoint_ciphertext,
        p_old_version: row.checkpoint_encryption_version };
      const attempt = await service.rpc("migrate_agent_checkpoint_ciphertext", identity);
      if (attempt.error) throw new Error("Unable to mark agent checkpoint attempt");
      if (!attempt.data) { result.conflicted++; continue; }
      const decoded = await decodeAgentCheckpoint(row);
      if (!decoded.checkpoint) { result.unchanged++; continue; }
      const key = await getContentKeys().current({ kind: "project", id: row.project_id });
      const version = key.version;
      key.bytes.fill(0);
      if (row.checkpoint_encryption_version === version && row.checkpoint_ciphertext &&
          getEncryptedStore().formatOf(getEncryptedStore().fromDatabase(row.checkpoint_ciphertext)) === 3) {
        result.unchanged++;
        continue;
      }
      const replacement = await encodeAgentCheckpoint(row.project_id, row.id, decoded.checkpoint);
      const verified = await decodeAgentCheckpoint({ ...row, checkpoint: null,
        checkpoint_ciphertext: replacement.checkpoint_ciphertext,
        checkpoint_encryption_version: replacement.checkpoint_encryption_version });
      if (JSON.stringify(verified.checkpoint) !== JSON.stringify(decoded.checkpoint)) {
        throw new Error("Agent checkpoint migration verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const commit = await service.rpc("migrate_agent_checkpoint_ciphertext", {
        ...identity, p_cipher: replacement.checkpoint_ciphertext,
        p_version: replacement.checkpoint_encryption_version,
      });
      if (commit.error) throw new Error("Unable to commit agent checkpoint migration");
      if (commit.data) result.migrated++; else result.conflicted++;
    } catch {
      result.failed++;
    }
  }
  const orphans = await service.from("agent_runtime_sessions")
    .select("conversation_id,checkpoint,checkpoint_ciphertext,checkpoint_encryption_version,conversation:agent_conversations!inner(project_id)")
    .is("current_run_id", null)
    .order("checkpoint_encryption_checked_at", { ascending: true, nullsFirst: true })
    .order("conversation_id", { ascending: true }).limit(limit);
  if (orphans.error) throw new Error("Unable to scan orphan agent runtime checkpoints");
  for (const raw of orphans.data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const row = raw as unknown as { conversation_id: string;
        checkpoint: AgentCheckpoint | null; checkpoint_ciphertext: string | null;
        checkpoint_encryption_version: number;
        conversation: { project_id: string } | null };
      const projectId = row.conversation?.project_id;
      if (!projectId || !row.conversation_id) throw new Error("Invalid runtime checkpoint scope");
      const context = { scope: { kind: "project" as const, id: projectId },
        table: "agent_runtime_sessions", column: "checkpoint", rowId: row.conversation_id };
      const store = getEncryptedStore();
      const clear = row.checkpoint_encryption_version > 0
        ? await store.decrypt(store.fromDatabase<AgentCheckpoint>(row.checkpoint_ciphertext!), context)
        : row.checkpoint;
      if (clear == null) {
        const marked = await service.rpc("migrate_orphan_agent_runtime_checkpoint", {
          p_conversation_id: row.conversation_id, p_project_id: projectId,
          p_old_checkpoint: row.checkpoint, p_old_cipher: row.checkpoint_ciphertext,
          p_old_version: row.checkpoint_encryption_version,
          p_cipher: null, p_version: null,
        });
        if (marked.error) throw new Error("Unable to mark orphan runtime checkpoint");
        if (marked.data) result.unchanged++; else result.conflicted++;
        continue;
      }
      if (typeof clear !== "object" || Array.isArray(clear)) {
        throw new Error("Invalid orphan runtime checkpoint");
      }
      const key = await getContentKeys().current(context.scope);
      const version = key.version;
      key.bytes.fill(0);
      const cipher = row.checkpoint_encryption_version === version &&
        row.checkpoint_ciphertext &&
        store.formatOf(store.fromDatabase(row.checkpoint_ciphertext)) === 3
        ? row.checkpoint_ciphertext
        : await store.encrypt(clear, context);
      const verified = await store.decrypt(store.fromDatabase<AgentCheckpoint>(cipher), context);
      if (JSON.stringify(verified) !== JSON.stringify(clear)) {
        throw new Error("Orphan runtime checkpoint verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const commit = await service.rpc("migrate_orphan_agent_runtime_checkpoint", {
        p_conversation_id: row.conversation_id, p_project_id: projectId,
        p_old_checkpoint: row.checkpoint, p_old_cipher: row.checkpoint_ciphertext,
        p_old_version: row.checkpoint_encryption_version,
        p_cipher: cipher, p_version: version,
      });
      if (commit.error) throw new Error("Unable to commit orphan runtime checkpoint");
      if (!commit.data) result.conflicted++;
      else if (cipher === row.checkpoint_ciphertext) result.unchanged++;
      else result.migrated++;
    } catch {
      result.failed++;
    }
  }
  return result;
}
