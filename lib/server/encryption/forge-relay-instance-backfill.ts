import "server-only";

import { isDeepStrictEqual } from "node:util";
import { getServiceClient } from "@/lib/supabase-service";
import { decodeRelayInstance, encodeRelayInstance,
  type RelayInstanceContentRow } from
  "@/lib/server/forge-relay/instance-content";
import { getContentKeys, getEncryptedStore } from "./registry";
import { isContentEncryptionEnabled } from "./content-config";

/** Rotate relay labels, destinations and secrets in bounded CAS batches. */
export async function backfillRelayInstancesBatch(limit = 20,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled()) {
    throw new Error("Relay instance encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid relay instance batch size");
  }
  const service = getServiceClient();
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const { data, error } = await service.from("forge_relay_instances")
    .select("*")
    .order("encryption_attempted_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan relay instances");
  const scope = { kind: "system" as const,
    id: "00000000-0000-0000-0000-000000000000" };
  const key = await getContentKeys().current(scope);
  const currentVersion = key.version;
  key.bytes.fill(0);
  for (const row of (data ?? []) as RelayInstanceContentRow[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const revision = Number(row.content_revision);
      if (!Number.isSafeInteger(revision) || revision < 0) {
        throw new Error("Invalid relay instance revision");
      }
      const plain = await decodeRelayInstance(row);
      const store = getEncryptedStore();
      const fresh = row.encryption_version === currentVersion &&
        typeof row.encrypted_content === "string" &&
        store.formatOf(store.fromDatabase(row.encrypted_content)) === 3;
      const encoded = fresh ? row : await encodeRelayInstance(plain,
        { service, force: true });
      const verified = await decodeRelayInstance(encoded);
      const content = (value: RelayInstanceContentRow) => ({
        name: value.name, webhookUrl: value.webhook_url,
        secret: value.webhook_secret_encrypted,
      });
      if (!isDeepStrictEqual(content(plain), content(verified))) {
        throw new Error("Relay instance migration mismatch");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const now = new Date().toISOString();
      const write = await service.from("forge_relay_instances")
        .update(fresh
          ? { encryption_checked_at: now, encryption_attempted_at: now }
          : { name: null, webhook_url: null,
            webhook_secret_encrypted: null,
            encrypted_content: encoded.encrypted_content,
            encryption_version: encoded.encryption_version,
            encryption_checked_at: now, encryption_attempted_at: now })
        .eq("id", row.id).eq("content_revision", revision)
        .select("id").maybeSingle();
      if (write.error) throw new Error("Unable to migrate relay instance");
      if (!write.data) result.conflicted++;
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch {
      result.failed++;
      if (signal?.aborted) { result.interrupted = true; break; }
      await service.from("forge_relay_instances")
        .update({ encryption_attempted_at: new Date().toISOString() })
        .eq("id", row.id).eq("content_revision", row.content_revision);
    }
  }
  return result;
}
