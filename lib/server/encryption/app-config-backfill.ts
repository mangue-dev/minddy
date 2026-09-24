import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeAppConfig, encodeAppConfig, appConfigEncryptionEnabled,
  type AppConfigRow } from "./app-config-content";
import { getContentKeys, getEncryptedStore } from "./registry";

/** Convert and rotate configuration rows with a bounded, service-only CAS pass. */
export async function backfillAppConfigBatch(limit = 30, signal?: AbortSignal) {
  if (!appConfigEncryptionEnabled()) throw new Error("App configuration encryption is not enabled");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid app configuration batch size");
  }
  const service = getServiceClient();
  const { data, error } = await service.from("app_config")
    .select("key,value,encryption_version,encrypted_content,encryption_checked_at")
    .order("encryption_checked_at", { ascending: true, nullsFirst: true })
    .order("key", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan app configuration");
  const result = { scanned: 0, migrated: 0, unchanged: 0,
    conflicted: 0, failed: 0, interrupted: false };
  const scope = { kind: "system" as const,
    id: "00000000-0000-0000-0000-000000000000" };
  const key = await getContentKeys().current(scope);
  const currentVersion = key.version;
  key.bytes.fill(0);
  for (const row of (data ?? []) as AppConfigRow[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const clear = await decodeAppConfig(row);
      const fresh = row.encryption_version === currentVersion &&
        row.encrypted_content != null &&
        getEncryptedStore().formatOf(
          getEncryptedStore().fromDatabase(row.encrypted_content)) === 3;
      const replacement = fresh ? row : await encodeAppConfig(row.key, clear,
        row.encryption_version ?? 0);
      if (!replacement.encrypted_content ||
          await decodeAppConfig(replacement) !== clear) {
        throw new Error("App configuration verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const write = await service.rpc("migrate_app_config_value", {
        p_key: row.key, p_old_value: row.value,
        p_old_cipher: row.encrypted_content ?? null,
        p_old_version: row.encryption_version ?? 0,
        p_new_cipher: replacement.encrypted_content,
        p_new_version: replacement.encryption_version,
      });
      if (write.error) throw new Error("Unable to migrate app configuration");
      if (!write.data) result.conflicted++;
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch {
      result.failed++;
      // A corrupt value must not hold the head of the ordered queue forever.
      try {
        await service.rpc("mark_app_config_attempt", {
          p_key: row.key, p_old_value: row.value,
          p_old_cipher: row.encrypted_content ?? null,
          p_old_version: row.encryption_version ?? 0,
        });
      } catch { /* The next pass can retry the failed attempt record. */ }
    }
  }
  return result;
}
