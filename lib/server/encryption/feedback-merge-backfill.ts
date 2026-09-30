import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "./content-config";

async function markAttempt(id: string, old: Record<string, unknown>) {
  const marked = await getServiceClient().rpc("mark_feedback_merge_payload_attempt", {
    p_event: id, p_old: old, p_allow_stale: true,
  });
  if (marked.error || !marked.data) {
    throw new Error("Unable to mark feedback merge attempt");
  }
}

/** Move historical merge undo UUIDs out of arbitrary JSON in bounded CAS batches. */
export async function backfillFeedbackMergeBatch(limit = 50,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled()) {
    throw new Error("Feedback merge conversion is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid feedback merge batch size");
  }
  const service = getServiceClient();
  const { data, error } = await service.from("feedback_merge_events")
    .select("id,payload")
    .neq("payload", "{}")
    .order("payload_attempted_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan feedback merge events");
  const result = { scanned: 0, migrated: 0, unchanged: 0,
    conflicted: 0, failed: 0, interrupted: false };
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const migrated = await service.rpc("migrate_feedback_merge_payload", {
        p_event: row.id, p_old: row.payload,
      });
      if (migrated.error) throw new Error("Unable to migrate feedback merge event");
      if (!migrated.data) {
        result.conflicted++;
        await markAttempt(row.id, row.payload);
      }
      else result.migrated++;
    } catch {
      result.failed++;
      await markAttempt(row.id, row.payload);
    }
  }
  return result;
}
