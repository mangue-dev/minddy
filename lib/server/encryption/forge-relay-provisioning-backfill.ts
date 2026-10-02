import "server-only";

import { isDeepStrictEqual } from "node:util";
import { getServiceClient } from "@/lib/supabase-service";
import { decodeProvisioning, encodeProvisioning, type ProvisioningRow } from
  "@/lib/server/forge-relay/provisioning-content";
import { getContentKeys, getEncryptedStore } from "./registry";
import { isContentEncryptionEnabled } from "./content-config";

/** Migrate the one provisioned identity with a content-revision CAS. */
export async function backfillRelayProvisioningBatch(signal?: AbortSignal) {
  if (!isContentEncryptionEnabled()) {
    throw new Error("Relay provisioning encryption is not enabled");
  }
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  if (signal?.aborted) { result.interrupted = true; return result; }
  const service = getServiceClient();
  const { data, error } = await service.from("forge_relay_provisioning")
    .select("*").eq("id", true).maybeSingle();
  if (error) throw new Error("Unable to load relay provisioning row");
  if (!data) return result;
  result.scanned = 1;
  const row = data as ProvisioningRow & { content_revision: number };
  const scope = { kind: "system" as const,
    id: "00000000-0000-0000-0000-000000000000" };
  try {
    const key = await getContentKeys().current(scope);
    const currentVersion = key.version;
    key.bytes.fill(0);
    const plain = await decodeProvisioning(row);
    const store = getEncryptedStore();
    const fresh = row.encryption_version === currentVersion &&
      typeof row.encrypted_content === "string" &&
      store.formatOf(store.fromDatabase(row.encrypted_content)) === 3;
    const encoded = fresh ? row : await encodeProvisioning(plain,
      { service, force: true });
    if (!isDeepStrictEqual(await decodeProvisioning(encoded), plain)) {
      throw new Error("Relay provisioning migration mismatch");
    }
    if (signal?.aborted) { result.interrupted = true; return result; }
    const now = new Date().toISOString();
    const write = await service.from("forge_relay_provisioning")
      .update(fresh
        ? { encryption_checked_at: now, encryption_attempted_at: now }
        : { ...encoded, encryption_checked_at: now,
          encryption_attempted_at: now })
      .eq("id", true).eq("content_revision", row.content_revision)
      .select("id").maybeSingle();
    if (write.error) throw new Error("Unable to migrate relay provisioning");
    if (!write.data) result.conflicted++;
    else if (fresh) result.unchanged++;
    else result.migrated++;
  } catch {
    result.failed++;
    await service.from("forge_relay_provisioning")
      .update({ encryption_attempted_at: new Date().toISOString() })
      .eq("id", true).eq("content_revision", row.content_revision);
  }
  return result;
}
