import "server-only";

import { isDeepStrictEqual } from "node:util";
import { getServiceClient } from "@/lib/supabase-service";
import { recordBackfillAttempt } from "./backfill-attempt";
import { decodeSavedView, encodeSavedView, savedViewValues } from
  "@/lib/server/saved-view-bookmark";
import { getContentKeys, getEncryptedStore } from "./registry";
import { isContentEncryptionEnabled } from "./content-config";

/** Verify and rotate personal bookmarks in bounded revision-guarded batches. */
export async function backfillSavedViewBookmarksBatch(limit = 30,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled()) {
    throw new Error("Saved-view encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid saved-view batch size");
  }
  const service = getServiceClient();
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const { data, error } = await service.from("saved_views").select("*")
    .order("encryption_attempted_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan saved views");
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      if (!await recordBackfillAttempt(service, "saved_views",
        "encryption_attempted_at", { id: row.id, content_revision: row.content_revision, encrypted_content: row.encrypted_content, encryption_version: row.encryption_version })) {
        result.conflicted++;
        continue;
      }
      const revision = Number(row.content_revision);
      if (!Number.isSafeInteger(revision) || revision < 0) {
        throw new Error("Invalid saved-view revision");
      }
      const userId = row.user_id as string;
      const plain = await decodeSavedView(row, userId);
      const current = await getContentKeys().current({ kind: "user", id: userId });
      const currentVersion = current.version;
      current.bytes.fill(0);
      const store = getEncryptedStore();
      const fresh = row.encryption_version === currentVersion &&
        typeof row.encrypted_content === "string" &&
        store.formatOf(store.fromDatabase(row.encrypted_content)) === 3;
      const encoded = fresh ? row : await encodeSavedView({ ...plain,
        encryption_version: row.encryption_version }, { force: true });
      const verified = fresh ? plain : await decodeSavedView(encoded, userId);
      if (!isDeepStrictEqual({ name: plain.name, href: plain.href },
          { name: verified.name, href: verified.href })) {
        throw new Error("Saved-view migration mismatch");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const write = await service.from("saved_views")
        .update(fresh
          ? { encryption_checked_at: new Date().toISOString() }
          : { ...savedViewValues(encoded),
            encryption_checked_at: new Date().toISOString() })
        .eq("id", row.id).eq("user_id", userId)
        .eq("content_revision", revision).select("id").maybeSingle();
      if (write.error) throw new Error("Unable to migrate saved view");
      if (!write.data) result.conflicted++;
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch { result.failed++; }
  }
  return result;
}
