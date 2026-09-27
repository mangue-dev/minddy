import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { openPush, pushIndex, pushVersion, sealPush, type StoredPush } from
  "@/lib/server/push/content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";

type Row = StoredPush & { content_revision: number;
  encryption_checked_at: string | null };

/** Rotate one bounded batch without changing endpoint or installation identity. */
export async function backfillPushBatch(limit = 25, signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_PUSH_CONTENT_ENCRYPTION_ENABLED !== "true")
    throw new Error("Push encryption is not enabled");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Invalid push batch size");
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("push_subscriptions")
    .select("*").order("encryption_attempted_at", { ascending: true,
      nullsFirst: true }).order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan push subscriptions");
  for (const row of (data ?? []) as Row[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const opened = await openPush(row);
      const endpointDigest = await pushIndex(opened.endpoint, "endpoint");
      const installationDigest = opened.native_installation_id
        ? await pushIndex(opened.native_installation_id,
          "native_installation_id", row.user_id) : null;
      if (row.endpoint_digest && row.endpoint_digest !== endpointDigest)
        throw new Error("Push endpoint index mismatch");
      const key = await getContentKeys().current({ kind: "user", id: row.user_id });
      const currentVersion = key.version;
      key.bytes.fill(0);
      const fresh = pushVersion(row.encrypted_content) === currentVersion &&
        !!row.encryption_checked_at;
      const content = fresh ? row.encrypted_content! : await sealPush({
        user_id: row.user_id, endpoint_digest: endpointDigest,
      }, { endpoint: opened.endpoint, p256dh: opened.p256dh,
        auth: opened.auth, native_installation_id: opened.native_installation_id,
        device_label: opened.device_label, user_agent: opened.user_agent });
      if (signal?.aborted) { result.interrupted = true; break; }
      const now = new Date().toISOString();
      let query = service.from("push_subscriptions").update({
        endpoint: null, p256dh: null, auth: null, native_installation_id: null,
        device_label: null, user_agent: null, endpoint_digest: endpointDigest,
        installation_digest: installationDigest, encrypted_content: content,
        encryption_checked_at: now, encryption_attempted_at: now,
      }).eq("id", row.id).eq("user_id", row.user_id)
        .eq("content_revision", row.content_revision);
      query = row.endpoint === null ? query.is("endpoint", null)
        : query.eq("endpoint", row.endpoint);
      query = row.encrypted_content ? query.eq("encrypted_content",
        row.encrypted_content) : query.is("encrypted_content", null);
      const { data: saved, error: writeError } = await query.select("id")
        .maybeSingle();
      if (writeError) throw new Error("Unable to migrate push subscription");
      if (!saved) result.conflicted++;
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch {
      result.failed++;
      await service.from("push_subscriptions")
        .update({ encryption_attempted_at: new Date().toISOString() })
        .eq("id", row.id).eq("content_revision", row.content_revision);
    }
  }
  return result;
}
