import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import {
  decodeJournal, encryptJournal, journalEncodedRow, journalLookup,
} from "@/lib/server/agent/encrypted-journal";
import { getContentKeys, getEncryptedStore } from "./registry";
import { isContentEncryptionEnabled } from "./content-config";

type Row = Parameters<typeof decodeJournal>[1] & {
  run: { project_id: string };
  payload_bytes?: number | null;
  event_count?: number | null;
  stored_bytes?: number | null;
};

/** Convert immutable batches under a version check, including historical keys. */
export async function backfillAgentJournalBatch(limit = 5, signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_AGENT_JOURNAL_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Agent journal encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("Invalid agent journal batch size");
  }
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("agent_run_journal")
    .select("*,run:agent_runs!inner(project_id)")
    .order("encryption_checked_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan agent journal migration");
  for (const row of (data ?? []) as Row[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const projectId = row.run?.project_id;
      if (!projectId || !Number.isSafeInteger(Number(row.id)) ||
          !Number.isSafeInteger(row.encryption_version) ||
          (row.encryption_version ?? 0) < 0) {
        throw new Error("Invalid agent journal migration metadata");
      }
      const identity = { p_id: row.id, p_run_id: row.run_id,
        p_previous_version: row.encryption_version };
      const attempt = await service.rpc("migrate_agent_journal_ciphertext", identity);
      if (attempt.error) throw new Error("Unable to mark agent journal attempt");
      if (!attempt.data) { result.conflicted++; continue; }

      const decoded = await decodeJournal(projectId, row);
      const current = await getContentKeys().current({ kind: "project", id: projectId });
      const version = current.version;
      current.bytes.fill(0);
      if (row.encryption_version === version &&
          typeof row.payload === "string" &&
          getEncryptedStore().formatOf(getEncryptedStore().fromDatabase(row.payload)) === 3) {
        result.unchanged++;
        continue;
      }
      const encoded = journalEncodedRow(row.run_id, row.session_id, decoded.events);
      let alternateLookup = false;
      if (row.encryption_version === 0 && row.events !== null) {
        const digest = await journalLookup(projectId, encoded.payload_sha256);
        const collision = await service.from("agent_run_journal").select("id")
          .eq("run_id", row.run_id).eq("session_id", row.session_id)
          .eq("payload_sha256", digest).neq("id", row.id).maybeSingle();
        if (collision.error) throw new Error("Unable to check agent journal lookup");
        alternateLookup = !!collision.data;
      }
      const replacement = await encryptJournal(projectId, {
        ...encoded, id: row.id, encryption_version: 0,
      }, alternateLookup);
      const verified = await decodeJournal(projectId, replacement);
      if (JSON.stringify(verified.events) !== JSON.stringify(decoded.events)) {
        throw new Error("Agent journal migration verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const commit = await service.rpc("migrate_agent_journal_ciphertext", {
        ...identity, p_payload: replacement.payload,
        p_digest: replacement.payload_sha256,
        p_version: replacement.encryption_version,
        p_event_count: replacement.event_count,
        p_payload_bytes: replacement.payload_bytes,
        p_stored_bytes: replacement.stored_bytes,
      });
      if (commit.error) throw new Error("Unable to commit agent journal migration");
      if (commit.data) result.migrated++; else result.conflicted++;
    } catch {
      result.failed++;
    }
  }
  return result;
}
