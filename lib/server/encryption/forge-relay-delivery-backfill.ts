import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeRelayDelivery, encodeRelayDelivery,
  isEncryptedRelayDelivery, relayDeliveryState } from
  "@/lib/server/forge-relay/delivery-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";

const SCOPE = { kind: "system" as const,
  id: "00000000-0000-0000-0000-000000000000" };

/** Convert payload and retry diagnostics together under one delivery-row CAS. */
export async function backfillForgeRelayDeliveriesBatch(limit = 20,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_FORGE_RELAY_DELIVERY_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Forge relay delivery encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid forge relay delivery batch size");
  }
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("forge_relay_deliveries")
    .select("id,instance_id,provider,delivery_guid,payload,last_error")
    .order("content_encryption_checked_at", { ascending: true,
      nullsFirst: true }).order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan forge relay deliveries");
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const key = await getContentKeys().current(SCOPE);
      const version = key.version;
      key.bytes.fill(0);
      const replacements: Record<"payload" | "last_error", string | null> = {
        payload: null, last_error: null,
      };
      for (const column of ["payload", "last_error"] as const) {
        const value = row[column];
        if (value === null) continue;
        if (isEncryptedRelayDelivery(value)) {
          const state = relayDeliveryState(value);
          if (state.version === version && state.format === 3) continue;
        }
        const plain = await decodeRelayDelivery(row.instance_id, row.provider,
          row.delivery_guid, column, value);
        if (plain === null) throw new Error("Missing relay delivery content");
        const cipher = await encodeRelayDelivery(row.instance_id, row.provider,
          row.delivery_guid, column, plain);
        if (await decodeRelayDelivery(row.instance_id, row.provider,
          row.delivery_guid, column, cipher) !== plain) {
          throw new Error("Relay delivery verification failed");
        }
        replacements[column] = cipher;
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const changed = replacements.payload !== null || replacements.last_error !== null;
      const committed = await service.rpc("migrate_forge_relay_delivery_content", {
        p_id: row.id, p_old_payload: row.payload, p_old_error: row.last_error,
        ...(changed ? { p_new_payload: replacements.payload,
          p_new_error: replacements.last_error } : {}),
      });
      if (committed.error) throw new Error("Unable to convert relay delivery");
      if (!committed.data) result.conflicted++;
      else if (changed) result.migrated++;
      else result.unchanged++;
    } catch { result.failed++; }
  }
  return result;
}
