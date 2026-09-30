import "server-only";

import { isDeepStrictEqual } from "node:util";
import { getServiceClient } from "@/lib/supabase-service";
import { recordBackfillAttempt } from "./backfill-attempt";
import { decodeView, encodeView, viewContentValues } from
  "@/lib/server/view-content";
import { getContentKeys, getEncryptedStore } from "./registry";
import { isContentEncryptionEnabled } from "./content-config";

/** Rotate private and shared board views in bounded revision-guarded batches. */
export async function backfillViewContentBatch(limit = 30,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled()) {
    throw new Error("View content encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid view content batch size");
  }
  const service = getServiceClient();
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const { data, error } = await service.from("views").select("*")
    .order("encryption_attempted_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan view content");
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      if (!await recordBackfillAttempt(service, "views",
        "encryption_attempted_at", { id: row.id, content_revision: row.content_revision, encrypted_content: row.encrypted_content, encryption_version: row.encryption_version })) {
        result.conflicted++;
        continue;
      }
      const revision = Number(row.content_revision);
      if (!Number.isSafeInteger(revision) || revision < 0) {
        throw new Error("Invalid view content revision");
      }
      const scope = row.project_id
        ? { kind: "project" as const, id: row.project_id as string }
        : { kind: "user" as const, id: row.user_id as string };
      if (!scope.id) throw new Error("Missing view content owner");
      const plain = await decodeView(row);
      const current = await getContentKeys().current(scope);
      const currentVersion = current.version;
      current.bytes.fill(0);
      const store = getEncryptedStore();
      const fresh = row.encryption_version === currentVersion &&
        typeof row.encrypted_content === "string" &&
        store.formatOf(store.fromDatabase(row.encrypted_content)) === 3;
      const encoded = fresh ? row : await encodeView({ ...plain,
        encryption_version: row.encryption_version }, { service, force: true });
      const verified = fresh ? plain : await decodeView(encoded);
      if (!isDeepStrictEqual({ name: plain.name, filters: plain.filters,
        display: plain.display }, { name: verified.name,
        filters: verified.filters, display: verified.display })) {
        throw new Error("View content migration mismatch");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const write = await service.rpc("migrate_verified_content_backfill", {
        p_table: "views",
        p_expected: { id: row.id, project_id: row.project_id, user_id: row.user_id, content_revision: revision,
          encryption_version: row.encryption_version, encrypted_content: row.encrypted_content },
        p_values: fresh ? {} : viewContentValues(encoded),
      });
      if (write.error) throw new Error("Unable to migrate view content");
      if (!write.data) result.conflicted++;
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch { result.failed++; }
  }
  return result;
}
