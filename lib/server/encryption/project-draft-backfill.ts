import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getEncryptedStore } from "./registry";
import { isContentEncryptionEnabled } from "./content-config";
import { migrateProtectedRows, type MigrationCandidate, type RowMigrationRepository } from "./row-migration";
import type { StoredRow } from "./row-codec";
import { rowMigrationProgress } from "./row-migration-progress";

/** Convert and rotate bounded owner-scoped drafts without changing their edit time. */
export async function backfillProjectDraftsBatch(limit = 50, signal?: AbortSignal) {
  if (!isContentEncryptionEnabled()) throw new Error("Content encryption is not enabled");
  const service = getServiceClient();
  const repository: RowMigrationRepository = {
    ...rowMigrationProgress(service, "project_drafts"),
    async scan(batchLimit) {
      const { data, error } = await service.from("project_drafts").select("*")
        .order("encryption_attempted_at", { ascending: true, nullsFirst: true })
        .order("id", { ascending: true }).limit(batchLimit);
      if (error) throw new Error("Unable to scan project draft migration");
      const candidates: MigrationCandidate[] = [];
      for (const row of data ?? []) {
        if (typeof row.id !== "string" || typeof row.user_id !== "string" ||
            !Number.isSafeInteger(row.encryption_revision) || row.encryption_revision < 0 ||
            row.encryption_revision >= Number.MAX_SAFE_INTEGER) {
          throw new Error("Invalid project draft migration metadata");
        }
        candidates.push({ row: row as StoredRow,
          context: { table: "project_drafts", scope: { kind: "user", id: row.user_id } },
          revision: String(row.encryption_revision) });
      }
      return candidates;
    },
    async compareAndSwap(candidate, replacement) {
      const { data, error } = await service.rpc("migrate_project_draft_ciphertext", {
        p_id: candidate.row.id, p_user_id: candidate.context.scope.id,
        p_revision: Number(candidate.revision), p_previous_version: candidate.row.encryption_version,
        p_encryption_version: replacement.encryption_version,
        p_encrypted_content: replacement.encrypted_content,
      });
      if (error) throw new Error("Unable to commit project draft migration");
      return data === true;
    },
  };
  return migrateProtectedRows(repository, getEncryptedStore(), { limit, signal });
}
