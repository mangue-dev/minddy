import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getEncryptedStore } from "./registry";
import { isContentEncryptionEnabled } from "./content-config";
import { migrateProtectedRows, type MigrationCandidate, type RowMigrationRepository } from "./row-migration";
import type { StoredRow } from "./row-codec";

/** Snapshots stay in the user's scope even after the referenced project is deleted. */
export async function backfillStatEventsBatch(limit = 50, signal?: AbortSignal) {
  if (!isContentEncryptionEnabled()) throw new Error("Content encryption is not enabled");
  const service = getServiceClient();
  const repository: RowMigrationRepository = {
    async scan(batchLimit) {
      const { data, error } = await service.from("stat_events").select("*")
        .order("encryption_checked_at", { ascending: true, nullsFirst: true })
        .order("id", { ascending: true }).limit(batchLimit);
      if (error) throw new Error("Unable to scan statistics migration");
      const candidates: MigrationCandidate[] = [];
      for (const row of data ?? []) {
        if (typeof row.id !== "string" || typeof row.user_id !== "string" ||
            !Number.isSafeInteger(row.encryption_revision) || row.encryption_revision < 0 || row.encryption_revision >= Number.MAX_SAFE_INTEGER) {
          throw new Error("Invalid statistics migration metadata");
        }
        const { error: attemptError } = await service.from("stat_events")
          .update({ encryption_checked_at: new Date().toISOString() }).eq("id", row.id)
          .eq("user_id", row.user_id).eq("encryption_revision", row.encryption_revision);
        if (attemptError) throw new Error("Unable to record statistics migration attempt");
        candidates.push({ row: row as StoredRow,
          context: { table: "stat_events", scope: { kind: "user", id: row.user_id } },
          revision: String(row.encryption_revision) });
      }
      return candidates;
    },
    async compareAndSwap(candidate, replacement) {
      const { data, error } = await service.from("stat_events").update({
        project_name: null, issue_title: null, task_text: null,
        encrypted_content: replacement.encrypted_content,
        encryption_version: replacement.encryption_version,
        encryption_revision: Number(candidate.revision) + 1,
      }).eq("id", candidate.row.id).eq("user_id", candidate.context.scope.id)
        .eq("encryption_revision", Number(candidate.revision))
        .eq("encryption_version", candidate.row.encryption_version).select("id");
      if (error) throw new Error("Unable to commit statistics migration");
      return (data?.length ?? 0) === 1;
    },
  };
  return migrateProtectedRows(repository, getEncryptedStore(), { limit, signal });
}
