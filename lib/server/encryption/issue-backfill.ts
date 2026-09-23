import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getEncryptedStore } from "./registry";
import { isContentEncryptionEnabled } from "./content-config";
import { migrateProtectedRows, type MigrationCandidate, type RowMigrationRepository } from "./row-migration";
import type { StoredRow } from "./row-codec";

/** Fair, revision-guarded conversion of issue source rows and historical keys. */
export async function backfillIssuesBatch(limit = 50, signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() || process.env.MINDDY_ISSUE_SOURCE_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Issue source encryption is not enabled");
  }
  const service = getServiceClient();
  const repository: RowMigrationRepository = {
    async scan(batchLimit) {
      const { data, error } = await service.from("issues").select("*")
        .order("encryption_checked_at", { ascending: true, nullsFirst: true })
        .order("id", { ascending: true }).limit(batchLimit);
      if (error) throw new Error("Unable to scan issue migration");
      const candidates: MigrationCandidate[] = [];
      for (const row of data ?? []) {
        if (typeof row.id !== "string" || typeof row.project_id !== "string" ||
            !Number.isSafeInteger(row.encryption_revision) || row.encryption_revision < 0 ||
            row.encryption_revision >= Number.MAX_SAFE_INTEGER) {
          throw new Error("Invalid issue migration metadata");
        }
        const { data: marked, error: attemptError } = await service.rpc("migrate_issue_ciphertext", {
          p_id: row.id, p_project_id: row.project_id, p_revision: row.encryption_revision,
          p_previous_version: row.encryption_version,
        });
        if (attemptError) throw new Error("Unable to record issue migration attempt");
        if (!marked) continue;
        candidates.push({ row: row as StoredRow,
          context: { table: "issues", scope: { kind: "project", id: row.project_id } },
          revision: String(row.encryption_revision) });
      }
      return candidates;
    },
    async compareAndSwap(candidate, replacement) {
      const { data, error } = await service.rpc("migrate_issue_ciphertext", {
        p_id: candidate.row.id, p_project_id: candidate.context.scope.id,
        p_revision: Number(candidate.revision), p_previous_version: candidate.row.encryption_version,
        p_encryption_version: replacement.encryption_version,
        p_encrypted_content: replacement.encrypted_content,
      });
      if (error) throw new Error("Unable to commit issue migration");
      return data === true;
    },
  };
  return migrateProtectedRows(repository, getEncryptedStore(), { limit, signal });
}
