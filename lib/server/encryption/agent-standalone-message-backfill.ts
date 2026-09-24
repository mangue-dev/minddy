import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeImportedAgentMessage, encodeImportedAgentMessage } from
  "@/lib/server/agent/run-launch-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys, getEncryptedStore } from "./registry";

type Message = { id: string; conversation_id: string; content: string;
  content_encryption_version: number; conversation: { project_id: string } | null };

/** Convert source-free transcript messages with a bounded compare-and-swap pass. */
export async function backfillAgentStandaloneMessages(limit = 20, signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_AGENT_LAUNCH_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Agent launch encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid agent message batch size");
  }
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("agent_messages")
    .select("id,conversation_id,content,content_encryption_version,conversation:agent_conversations!inner(project_id)")
    .is("legacy_event_id", null).is("legacy_queue_message_id", null)
    .or("run_id.is.null,source.eq.system")
    .order("standalone_encryption_checked_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan agent messages");
  for (const row of (data ?? []) as unknown as Message[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const projectId = row.conversation?.project_id;
      if (!projectId || !row.id || !row.conversation_id ||
          !Number.isSafeInteger(row.content_encryption_version) ||
          row.content_encryption_version < 0) {
        throw new Error("Invalid agent message scope");
      }
      const identity = { p_id: row.id, p_conversation_id: row.conversation_id,
        p_project_id: projectId, p_old_content: row.content,
        p_old_version: row.content_encryption_version };
      const attempt = await service.rpc("migrate_agent_standalone_message", identity);
      if (attempt.error) throw new Error("Unable to mark agent message attempt");
      if (!attempt.data) { result.conflicted++; continue; }
      const decoded = await decodeImportedAgentMessage(projectId, row);
      const current = await getContentKeys().current({ kind: "project", id: projectId });
      const keyVersion = current.version;
      current.bytes.fill(0);
      if (row.content_encryption_version === keyVersion &&
          getEncryptedStore().formatOf(getEncryptedStore().fromDatabase(row.content)) === 3) {
        result.unchanged++;
        continue;
      }
      const replacement = await encodeImportedAgentMessage(projectId, row.id, decoded.content);
      const verified = await decodeImportedAgentMessage(projectId, {
        ...row, ...replacement,
      });
      if (verified.content !== decoded.content) {
        throw new Error("Agent message migration verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const committed = await service.rpc("migrate_agent_standalone_message", {
        ...identity, p_content: replacement.content,
        p_version: replacement.content_encryption_version,
      });
      if (committed.error) throw new Error("Unable to commit agent message migration");
      if (committed.data) result.migrated++; else result.conflicted++;
    } catch {
      result.failed++;
    }
  }
  return result;
}
