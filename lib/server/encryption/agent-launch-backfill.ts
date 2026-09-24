import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeAgentLaunch, encodeAgentLaunch,
  type StoredLaunch } from "@/lib/server/agent/run-launch-content";
import { getContentKeys, getEncryptedStore } from "./registry";
import { isContentEncryptionEnabled } from "./content-config";

/** Convert launch text and its SQL-created first-message copy atomically. */
export async function backfillAgentLaunchBatch(limit = 20, signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_AGENT_LAUNCH_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Agent launch encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid agent launch batch size");
  }
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("agent_runs")
    .select("id,project_id,conversation_id,prompt,prompt_mentions,encrypted_launch_content,launch_encryption_version")
    .order("launch_encryption_checked_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan agent launch migration");
  for (const row of (data ?? []) as StoredLaunch[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      if (!row.id || !row.project_id || !row.conversation_id ||
          !Number.isSafeInteger(row.launch_encryption_version) ||
          (row.launch_encryption_version ?? -1) < 0) {
        throw new Error("Invalid agent launch migration metadata");
      }
      const identity = { p_id: row.id, p_project_id: row.project_id,
        p_conversation_id: row.conversation_id,
        p_previous_version: row.launch_encryption_version };
      const attempt = await service.rpc("migrate_agent_launch_ciphertext", identity);
      if (attempt.error) throw new Error("Unable to mark agent launch attempt");
      if (!attempt.data) { result.conflicted++; continue; }
      const decoded = await decodeAgentLaunch(row);
      const current = await getContentKeys().current({ kind: "project", id: row.project_id });
      const version = current.version;
      current.bytes.fill(0);
      if (row.launch_encryption_version === version && row.encrypted_launch_content &&
          getEncryptedStore().formatOf(getEncryptedStore().fromDatabase(row.encrypted_launch_content)) === 3) {
        result.unchanged++;
        continue;
      }
      const replacement = await encodeAgentLaunch(row.project_id, row.id, {
        prompt: decoded.prompt, prompt_mentions: decoded.prompt_mentions,
      });
      const verified = await decodeAgentLaunch({ ...row, prompt: null,
        prompt_mentions: null, encrypted_launch_content: replacement.encrypted_launch_content,
        launch_encryption_version: replacement.launch_encryption_version });
      if (JSON.stringify([verified.prompt, verified.prompt_mentions]) !==
          JSON.stringify([decoded.prompt, decoded.prompt_mentions])) {
        throw new Error("Agent launch migration verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const commit = await service.rpc("migrate_agent_launch_ciphertext", {
        ...identity, p_content: replacement.encrypted_launch_content,
        p_version: replacement.launch_encryption_version,
        p_has_prompt: replacement.has_launch_prompt,
      });
      if (commit.error) throw new Error("Unable to commit agent launch migration");
      if (commit.data) result.migrated++; else result.conflicted++;
    } catch {
      result.failed++;
    }
  }
  return result;
}
