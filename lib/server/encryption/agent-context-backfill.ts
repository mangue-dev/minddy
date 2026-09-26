import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeAgentContextSnapshot, encodeAgentContextSnapshot,
  type StoredAgentContext } from "@/lib/server/agent/context-snapshot-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys, getEncryptedStore } from "./registry";

type ContextRow = StoredAgentContext & {
  id: string;
  snapshot_ciphertext: string | null;
  snapshot_encryption_version: number;
  conversation: { project_id: string } | null;
};

/** Convert context snapshots in bounded, verified compare-and-swap batches. */
export async function backfillAgentContextsBatch(limit = 20, signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_AGENT_CONTEXT_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Agent context encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid agent context batch size");
  }
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("agent_conversation_contexts")
    .select("id,conversation_id,kind,resource_id,snapshot,snapshot_ciphertext,snapshot_encryption_version,conversation:agent_conversations!inner(project_id)")
    .order("snapshot_encryption_checked_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan agent context snapshots");
  for (const row of (data ?? []) as unknown as ContextRow[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const projectId = row.conversation?.project_id;
      if (!projectId || !row.id || !Number.isSafeInteger(row.snapshot_encryption_version) ||
          row.snapshot_encryption_version < 0) throw new Error("Invalid agent context scope");
      const identity = { p_id: row.id, p_conversation_id: row.conversation_id,
        p_project_id: projectId, p_old_snapshot: row.snapshot,
        p_old_cipher: row.snapshot_ciphertext,
        p_old_version: row.snapshot_encryption_version };
      const attempt = await service.rpc("migrate_agent_context_snapshot", identity);
      if (attempt.error) throw new Error("Unable to mark agent context attempt");
      if (!attempt.data) { result.conflicted++; continue; }
      const decoded = await decodeAgentContextSnapshot(projectId, row);
      const key = await getContentKeys().current({ kind: "project", id: projectId });
      const version = key.version;
      key.bytes.fill(0);
      if (row.snapshot_encryption_version === version && row.snapshot_ciphertext &&
          getEncryptedStore().formatOf(getEncryptedStore().fromDatabase(row.snapshot_ciphertext)) === 3) {
        result.unchanged++;
        continue;
      }
      const replacement = await encodeAgentContextSnapshot(projectId, decoded);
      const verified = await decodeAgentContextSnapshot(projectId, { ...row, ...replacement });
      if (JSON.stringify(verified.snapshot) !== JSON.stringify(decoded.snapshot)) {
        throw new Error("Agent context migration verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const committed = await service.rpc("migrate_agent_context_snapshot", {
        ...identity, p_cipher: replacement.snapshot_ciphertext,
        p_version: replacement.snapshot_encryption_version,
      });
      if (committed.error) throw new Error("Unable to commit agent context migration");
      if (committed.data) result.migrated++; else result.conflicted++;
    } catch {
      result.failed++;
    }
  }
  return result;
}
