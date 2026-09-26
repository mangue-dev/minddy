import "server-only";

import { isDeepStrictEqual } from "node:util";
import { getServiceClient } from "@/lib/supabase-service";
import { decodeDeliveryTokens, encodeDeliveryTokens,
  type DeliveryTokenRow } from
  "@/lib/server/forge-relay/user-delivery-content";
import { getContentKeys, getEncryptedStore } from "./registry";
import { isContentEncryptionEnabled } from "./content-config";

/** Rotate short-lived relay OAuth deliveries without changing their status. */
export async function backfillRelayUserDeliveriesBatch(limit = 30,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_RELAY_USER_DELIVERY_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Relay user delivery encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid relay user delivery batch size");
  }
  const service = getServiceClient();
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const { data, error } = await service.from("forge_relay_user_deliveries")
    .select("*").order("encryption_attempted_at",
      { ascending: true, nullsFirst: true })
    .order("id",{ ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan relay user deliveries");
  const scope = { kind: "system" as const,
    id: "00000000-0000-0000-0000-000000000000" };
  const key = await getContentKeys().current(scope);
  const currentVersion = key.version;
  key.bytes.fill(0);
  for (const row of (data ?? []) as (DeliveryTokenRow &
      { content_revision: number })[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const tokens = await decodeDeliveryTokens(row);
      const store = getEncryptedStore();
      const fresh = row.encryption_version === currentVersion &&
        typeof row.encrypted_content === "string" &&
        store.formatOf(store.fromDatabase(row.encrypted_content)) === 3;
      const encoded = fresh ? row : await encodeDeliveryTokens(row.id,
        row.instance_id,tokens,{ service, force: true });
      if (!isDeepStrictEqual(await decodeDeliveryTokens({ ...row,
        ...encoded }),tokens)) {
        throw new Error("Relay user delivery migration mismatch");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const now = new Date().toISOString();
      const write = await service.from("forge_relay_user_deliveries")
        .update(fresh
          ? { encryption_checked_at: now, encryption_attempted_at: now }
          : { ...encoded, encryption_checked_at: now,
            encryption_attempted_at: now })
        .eq("id",row.id).eq("content_revision",row.content_revision)
        .select("id").maybeSingle();
      if (write.error) throw new Error("Unable to migrate relay user delivery");
      if (!write.data) result.conflicted++;
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch {
      result.failed++;
      if (signal?.aborted) { result.interrupted = true; break; }
      await service.from("forge_relay_user_deliveries")
        .update({ encryption_attempted_at: new Date().toISOString() })
        .eq("id",row.id).eq("content_revision",row.content_revision);
    }
  }
  return result;
}
