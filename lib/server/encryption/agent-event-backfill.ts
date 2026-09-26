import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeRunEvent, encodeRunEvent } from "@/lib/server/agent/run-event-store";
import { getContentKeys, getEncryptedStore } from "./registry";
import { isContentEncryptionEnabled } from "./content-config";

type EventRow = Parameters<typeof decodeRunEvent>[1] & {
  run: { project_id: string };
};

/** Convert event payload and SQL-created copies under one database transaction. */
export async function backfillAgentEventsBatch(limit = 20, signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_AGENT_EVENT_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Agent event encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid agent event batch size");
  }
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("agent_run_events")
    .select("id,run_id,seq,type,payload,encrypted_content,encryption_version,created_at,run:agent_runs!inner(project_id)")
    .order("encryption_checked_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan agent event migration");
  for (const row of (data ?? []) as unknown as EventRow[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const projectId = row.run?.project_id;
      if (!projectId || !row.id || !row.run_id ||
          !Number.isSafeInteger(row.encryption_version) || row.encryption_version < 0) {
        throw new Error("Invalid agent event migration metadata");
      }
      const identity = { p_id: row.id, p_run_id: row.run_id,
        p_previous_version: row.encryption_version };
      const attempt = await service.rpc("migrate_agent_event_ciphertext", identity);
      if (attempt.error) throw new Error("Unable to mark agent event attempt");
      if (!attempt.data) { result.conflicted++; continue; }
      const decoded = await decodeRunEvent(projectId, row);
      const current = await getContentKeys().current({ kind: "project", id: projectId });
      const version = current.version;
      current.bytes.fill(0);
      if (row.encryption_version === version && row.encrypted_content &&
          getEncryptedStore().formatOf(getEncryptedStore().fromDatabase(row.encrypted_content)) === 3) {
        result.unchanged++;
        continue;
      }
      const replacement = await encodeRunEvent(projectId, row.run_id, row.seq,
        row.type, decoded.payload, row.id);
      const verified = await decodeRunEvent(projectId, {
        ...row, payload: null, encrypted_content: replacement.encrypted_content,
        encryption_version: replacement.encryption_version,
      });
      if (JSON.stringify(verified.payload) !== JSON.stringify(decoded.payload)) {
        throw new Error("Agent event migration verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const commit = await service.rpc("migrate_agent_event_ciphertext", {
        ...identity, p_content: replacement.encrypted_content,
        p_version: replacement.encryption_version,
      });
      if (commit.error) throw new Error("Unable to commit agent event migration");
      if (commit.data) result.migrated++; else result.conflicted++;
    } catch {
      result.failed++;
    }
  }
  return result;
}
