import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { MigrationCandidate } from "./row-migration";
import type { StoredRow } from "./row-codec";

type Table = "feedback_posts" | "objectives" | "categories" | "comments" |
  "page_comments" | "issues" | "project_drafts" | "issue_events" |
  "page_versions" | "stat_events" | "user_scratchpad";

/** Progress markers use the same identity, owner, revision, and ciphertext CAS as migration writes. */
export function rowMigrationProgress(service: ReturnType<typeof getServiceClient>,
  table: Table) {
  const scratchpad = table === "user_scratchpad";
  const key = scratchpad ? "user_id" : "id";
  const owner = table === "project_drafts" || table === "stat_events" || scratchpad
    ? "user_id" : "project_id";
  const revisionColumn = scratchpad ? "rev" : "encryption_revision";

  async function mark(candidate: MigrationCandidate, row: StoredRow,
    revision: string, verified: boolean) {
    const id = row[key];
    if (typeof id !== "string" || !Number.isSafeInteger(Number(revision)) ||
        Number(revision) < 0) return false;
    const { data, error } = await service.rpc("record_encryption_backfill_progress", {
      p_table: table, p_attempt_column: "encryption_attempted_at",
      p_expected: { [key]: id, [owner]: candidate.context.scope.id,
        [revisionColumn]: Number(revision),
        encryption_version: row.encryption_version,
        encrypted_content: row.encrypted_content },
      p_verified: verified,
    });
    if (error) throw new Error("Unable to record row migration progress");
    return data === true;
  }

  return {
    recordAttempt: (candidate: MigrationCandidate) => mark(candidate,
      candidate.row, candidate.revision, false),
    recordVerified: (candidate: MigrationCandidate, persisted: StoredRow,
      revision: string) => mark(candidate, persisted, revision, true),
  };
}
