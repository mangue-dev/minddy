import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "./content-config";
import { providerResourceIndex } from "./provider-resource-key";

/** Convert historical lease identities without resetting quota or deduplication. */
export async function backfillProviderResourcesBatch(limit = 50,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled()) {
    throw new Error("Provider resource protection is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid provider resource batch size");
  }
  const service = getServiceClient();
  const { data, error } = await service.rpc(
    "list_provider_operation_resource_candidates", { p_limit: limit });
  if (error) throw new Error("Unable to scan provider reservations");
  const result = { scanned: 0, migrated: 0, conflicted: 0,
    failed: 0, interrupted: false };
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const indexed = await providerResourceIndex(row.resource_key);
      const write = await service.rpc("migrate_provider_operation_resource", {
        p_id: row.id, p_old: row.resource_key, p_new: indexed,
        p_old_lease: row.lease_expires_at,
      });
      if (write.error) throw new Error("Unable to rekey provider reservation");
      if (write.data) result.migrated++;
      else result.conflicted++;
    } catch { result.failed++; }
  }
  return result;
}
