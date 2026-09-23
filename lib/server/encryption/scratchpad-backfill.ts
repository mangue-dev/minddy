import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getEncryptedStore } from "./registry";
import { isContentEncryptionEnabled } from "./content-config";
import { migrateProtectedRows, type MigrationCandidate, type RowMigrationRepository } from "./row-migration";
import type { StoredRow } from "./row-codec";

/** Includes old formats and DEK versions; attempt ordering prevents failed rows starving others. */
export async function backfillScratchpadsBatch(limit = 50, signal?: AbortSignal) {
  if (!isContentEncryptionEnabled()) throw new Error("Content encryption is not enabled");
  const service = getServiceClient();
  const repository: RowMigrationRepository = {
    async scan(batchLimit) {
      const { data, error } = await service.from("user_scratchpad").select("*")
        .order("encryption_checked_at", { ascending: true, nullsFirst: true })
        .order("user_id", { ascending: true }).limit(batchLimit);
      if (error) throw new Error("Unable to scan scratchpad migration");
      const candidates: MigrationCandidate[] = [];
      for (const row of data ?? []) {
        if (typeof row.user_id !== "string" || !Number.isSafeInteger(row.rev) || row.rev < 0 || row.rev >= Number.MAX_SAFE_INTEGER) {
          throw new Error("Invalid scratchpad migration metadata");
        }
        const { error: attemptError } = await service.from("user_scratchpad")
          .update({ encryption_checked_at: new Date().toISOString() }).eq("user_id", row.user_id).eq("rev", row.rev);
        if (attemptError) throw new Error("Unable to record scratchpad migration attempt");
        candidates.push({
          row: row as StoredRow,
          context: { table: "user_scratchpad", scope: { kind: "user", id: row.user_id } },
          revision: String(row.rev),
        });
      }
      return candidates;
    },
    async compareAndSwap(candidate, replacement) {
      const { data, error } = await service.from("user_scratchpad").update({
        content: replacement.content,
        encrypted_content: replacement.encrypted_content,
        encryption_version: replacement.encryption_version,
        rev: Number(candidate.revision) + 1,
      }).eq("user_id", candidate.context.scope.id).eq("rev", Number(candidate.revision))
        .eq("encryption_version", candidate.row.encryption_version).select("user_id");
      if (error) throw new Error("Unable to commit scratchpad migration");
      return (data?.length ?? 0) === 1;
    },
  };
  return migrateProtectedRows(repository, getEncryptedStore(), { limit, signal });
}
