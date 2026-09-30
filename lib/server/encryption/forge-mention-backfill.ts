import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "./content-config";
import { forgeMentionKeyIndex } from "./forge-mention-key";

/** Convert old counter identities with CAS; a live claim folds its own row first. */
export async function backfillForgeMentionKeysBatch(limit = 50,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled()) {
    throw new Error("Forge mention key protection is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid forge mention key batch size");
  }
  const service = getServiceClient();
  const { data, error } = await service.from("forge_mention_throttle")
    .select("key,window_start,count").not("key", "like", "mdyf1:%")
    .order("key", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan forge mention counters");
  const result = { scanned: 0, migrated: 0, conflicted: 0,
    failed: 0, interrupted: false };
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const indexed = await forgeMentionKeyIndex(row.key);
      const write = await service.rpc("rekey_forge_mention_counter", {
        p_legacy: row.key, p_indexed: indexed, p_window_seconds: 3600,
        p_expected_start: row.window_start, p_expected_count: row.count,
      });
      if (write.error) throw new Error("Unable to rekey forge mention counter");
      if (write.data) result.migrated++;
      else result.conflicted++;
    } catch { result.failed++; }
  }
  return result;
}
