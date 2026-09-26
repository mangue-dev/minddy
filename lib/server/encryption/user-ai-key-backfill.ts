import "server-only";

import { isDeepStrictEqual } from "node:util";
import { getServiceClient } from "@/lib/supabase-service";
import { decodeUserAiKeyRow, encodeUserAiKeyRow,
  type UserAiKeyRow } from "@/lib/server/user-ai-key-content";
import { getContentKeys, getEncryptedStore } from "./registry";
import { isContentEncryptionEnabled } from "./content-config";

/** Migrate and rotate complete BYOK rows under bounded compare-and-swap edits. */
export async function backfillUserAiKeysBatch(limit = 30,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_USER_AI_KEY_ENCRYPTION_ENABLED !== "true") {
    throw new Error("BYOK encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid BYOK batch size");
  }
  const service = getServiceClient();
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const { data, error } = await service.from("user_ai_keys").select("*")
    .order("encryption_attempted_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan BYOK credentials");
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const revision = Number(row.content_revision);
      if (!Number.isSafeInteger(revision) || revision < 0) {
        throw new Error("Invalid BYOK revision");
      }
      const scope = { kind: "user" as const, id: row.user_id as string };
      if (!scope.id) throw new Error("Missing BYOK owner");
      const plain = await decodeUserAiKeyRow(row as UserAiKeyRow);
      const current = await getContentKeys().current(scope);
      const currentVersion = current.version;
      current.bytes.fill(0);
      const store = getEncryptedStore();
      const fresh = row.encryption_version === currentVersion &&
        typeof row.encrypted_content === "string" &&
        store.formatOf(store.fromDatabase(row.encrypted_content)) === 3;
      const encoded = fresh ? row as UserAiKeyRow : await encodeUserAiKeyRow({
        ...plain, encryption_version: row.encryption_version,
      }, { force: true });
      const verified = fresh ? plain : await decodeUserAiKeyRow(encoded);
      const fields = (value: UserAiKeyRow) => ({
        key: value.key_encrypted, baseUrl: value.base_url,
        featureModels: value.feature_models,
      });
      if (!isDeepStrictEqual(fields(plain), fields(verified))) {
        throw new Error("BYOK migration mismatch");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const write = await service.from("user_ai_keys")
        .update(fresh
          ? { encryption_checked_at: new Date().toISOString(),
            encryption_attempted_at: new Date().toISOString() }
          : { key_encrypted: null, base_url: null, feature_models: null,
            encrypted_content: encoded.encrypted_content,
            encryption_version: encoded.encryption_version,
            encryption_checked_at: new Date().toISOString(),
            encryption_attempted_at: new Date().toISOString() })
        .eq("id", row.id).eq("user_id", row.user_id)
        .eq("content_revision", revision).select("id").maybeSingle();
      if (write.error) throw new Error("Unable to migrate BYOK credential");
      if (!write.data) result.conflicted++;
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch {
      result.failed++;
      if (signal?.aborted) { result.interrupted = true; break; }
      // A corrupt row must not keep later credentials behind the batch limit.
      await service.from("user_ai_keys")
        .update({ encryption_attempted_at: new Date().toISOString() })
        .eq("id", row.id).eq("user_id", row.user_id)
        .eq("content_revision", row.content_revision);
    }
  }
  return result;
}
