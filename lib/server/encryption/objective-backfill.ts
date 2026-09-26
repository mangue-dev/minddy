import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getEncryptedStore } from "./registry";
import { isContentEncryptionEnabled } from "./content-config";
import { migrateProtectedRows, type MigrationCandidate, type RowMigrationRepository } from "./row-migration";
import type { StoredRow } from "./row-codec";

/** Fair, revision-guarded conversion of legacy objectives and old key versions. */
export async function backfillObjectivesBatch(limit = 50, signal?: AbortSignal) {
  if (!isContentEncryptionEnabled()) throw new Error("Content encryption is not enabled");
  const service = getServiceClient();
  const repository: RowMigrationRepository = {
    async scan(batchLimit) {
      const { data, error } = await service.from("objectives").select("*")
        .order("encryption_checked_at", { ascending: true, nullsFirst: true })
        .order("id", { ascending: true }).limit(batchLimit);
      if (error) throw new Error("Unable to scan objective migration");
      const candidates: MigrationCandidate[] = [];
      for (const row of data ?? []) {
        if (typeof row.id !== "string" || typeof row.project_id !== "string" ||
            !Number.isSafeInteger(row.encryption_revision) || row.encryption_revision < 0 ||
            row.encryption_revision >= Number.MAX_SAFE_INTEGER) {
          throw new Error("Invalid objective migration metadata");
        }
        const { data: marked, error: attemptError } = await service.rpc("migrate_objective_ciphertext", {
          p_id: row.id, p_project_id: row.project_id, p_revision: row.encryption_revision,
          p_previous_version: row.encryption_version,
        });
        if (attemptError) throw new Error("Unable to record objective migration attempt");
        if (!marked) continue;
        candidates.push({ row: row as StoredRow,
          context: { table: "objectives", scope: { kind: "project", id: row.project_id } },
          revision: String(row.encryption_revision) });
      }
      return candidates;
    },
    async compareAndSwap(candidate, replacement) {
      const { data, error } = await service.rpc("migrate_objective_ciphertext", {
        p_id: candidate.row.id, p_project_id: candidate.context.scope.id,
        p_revision: Number(candidate.revision), p_previous_version: candidate.row.encryption_version,
        p_encryption_version: replacement.encryption_version,
        p_encrypted_content: replacement.encrypted_content,
      });
      if (error) throw new Error("Unable to commit objective migration");
      return data === true;
    },
  };
  return migrateProtectedRows(repository, getEncryptedStore(), { limit, signal });
}
