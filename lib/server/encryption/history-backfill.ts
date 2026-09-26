import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getEncryptedStore } from "./registry";
import { isContentEncryptionEnabled } from "./content-config";
import { migrateProtectedRows, type MigrationCandidate, type RowMigrationRepository } from "./row-migration";
import type { StoredRow } from "./row-codec";
import type { HistoryTable } from "./history-content";

/** Only these converted repositories are eligible; snapshots are not inferred from the policy inventory. */
export async function backfillHistoryBatch(table: HistoryTable, limit = 50, signal?: AbortSignal) {
  if (!isContentEncryptionEnabled()) throw new Error("Content encryption is not enabled");
  if (table !== "issue_events" && table !== "page_versions") throw new Error("Unsupported history table");
  const service = getServiceClient();
  const repository: RowMigrationRepository = {
    async scan(batchLimit) {
      const { data, error } = await service.from(table).select("*")
        .order("encryption_checked_at", { ascending: true, nullsFirst: true })
        .order("id", { ascending: true }).limit(batchLimit);
      if (error) throw new Error("Unable to scan history migration");
      const candidates: MigrationCandidate[] = [];
      for (const row of data ?? []) {
        if (typeof row.id !== "string" || typeof row.project_id !== "string" ||
            !Number.isSafeInteger(row.encryption_revision) || row.encryption_revision < 0 || row.encryption_revision >= Number.MAX_SAFE_INTEGER) {
          throw new Error("Invalid history migration metadata");
        }
        const { error: attemptError } = await service.from(table)
          .update({ encryption_checked_at: new Date().toISOString() }).eq("id", row.id)
          .eq("project_id", row.project_id).eq("encryption_revision", row.encryption_revision);
        if (attemptError) throw new Error("Unable to record history migration attempt");
        candidates.push({ row: row as StoredRow,
          context: { table, scope: { kind: "project", id: row.project_id } },
          revision: String(row.encryption_revision) });
      }
      return candidates;
    },
    async compareAndSwap(candidate, replacement) {
      const content = table === "issue_events" ? { from_value: null, to_value: null } : { title: null, icon: null, content: null };
      const { data, error } = await service.from(table).update({
        ...content, encrypted_content: replacement.encrypted_content,
        encryption_version: replacement.encryption_version,
        encryption_revision: Number(candidate.revision) + 1,
      }).eq("id", candidate.row.id).eq("project_id", candidate.context.scope.id)
        .eq("encryption_revision", Number(candidate.revision))
        .eq("encryption_version", candidate.row.encryption_version).select("id");
      if (error) throw new Error("Unable to commit history migration");
      return (data?.length ?? 0) === 1;
    },
  };
  return migrateProtectedRows(repository, getEncryptedStore(), { limit, signal });
}
