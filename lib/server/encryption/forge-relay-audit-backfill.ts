import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

/** Scrub historical relay details without losing the action or quota timestamp. */
export async function scrubForgeRelayAuditBatch(limit = 100,
  signal?: AbortSignal) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("Invalid forge relay audit batch size");
  }
  const result = { scanned: 0, scrubbed: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("forge_relay_audit")
    .select("id,detail")
    .order("detail_checked_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan forge relay audit");
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const committed = await service.rpc("scrub_forge_relay_audit_detail", {
        p_id: row.id, p_old_detail: row.detail,
      });
      if (committed.error) throw new Error("Unable to scrub relay audit detail");
      if (!committed.data) result.conflicted++;
      else if (Object.keys(row.detail ?? {}).length) result.scrubbed++;
      else result.unchanged++;
    } catch { result.failed++; }
  }
  return result;
}
