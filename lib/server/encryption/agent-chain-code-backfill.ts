import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "./content-config";

/** Remove non-code legacy automation fields in bounded, row-locked batches. */
export async function backfillAgentChainCodesBatch(limit = 50,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_AGENT_CHAIN_CODE_CLEANUP_ENABLED !== "true") {
    throw new Error("Agent chain code cleanup is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid agent chain batch size");
  }
  const service = getServiceClient();
  const { data, error } = await service.from("agent_chains")
    .select("id,pending_event,stop_reason")
    .is("codes_checked_at", null)
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan agent chains");
  const result = { scanned: 0, migrated: 0, conflicted: 0,
    failed: 0, interrupted: false };
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const migrated = await service.rpc("migrate_agent_chain_codes", {
        p_id: row.id, p_old_pending: row.pending_event,
        p_old_reason: row.stop_reason,
      });
      if (migrated.error) throw new Error("Unable to clean agent chain codes");
      if (migrated.data) result.migrated++;
      else result.conflicted++;
    } catch { result.failed++; }
  }
  return result;
}
