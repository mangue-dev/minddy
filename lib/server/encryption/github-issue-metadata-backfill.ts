import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeGithubIssueMetadata, encodeGithubIssueMetadata,
  type StoredGithubIssueMetadata } from "@/lib/server/git/issue-sync-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys, getEncryptedStore } from "./registry";

type MetadataRow = StoredGithubIssueMetadata & {
  content_ciphertext: string | null;
  content_encryption_version: number;
  synced_at: string;
  issue: { project_id: string } | null;
};

/** Convert issue-sidecar content with a bounded compare-and-swap pass. */
export async function backfillGithubIssueMetadataBatch(limit = 20,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_ISSUE_SIDECAR_ENCRYPTION_ENABLED !== "true") {
    throw new Error("GitHub issue metadata encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid GitHub issue metadata batch size");
  }
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("github_issue_sync_metadata")
    .select("issue_id,metadata,milestone,content_ciphertext,content_encryption_version,synced_at,issue:issues!inner(project_id)")
    .order("content_encryption_checked_at", { ascending: true, nullsFirst: true })
    .order("issue_id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan GitHub issue metadata");
  for (const row of (data ?? []) as unknown as MetadataRow[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const projectId = row.issue?.project_id;
      if (!projectId || !row.issue_id || !Number.isSafeInteger(row.content_encryption_version) ||
          row.content_encryption_version < 0) throw new Error("Invalid issue metadata scope");
      const identity = { p_issue_id: row.issue_id, p_project_id: projectId,
        p_old_metadata: row.metadata, p_old_milestone: row.milestone,
        p_old_cipher: row.content_ciphertext,
        p_old_version: row.content_encryption_version,
        p_old_synced_at: row.synced_at };
      const attempt = await service.rpc("migrate_github_issue_metadata", identity);
      if (attempt.error) throw new Error("Unable to mark issue metadata attempt");
      if (!attempt.data) { result.conflicted++; continue; }
      const decoded = await decodeGithubIssueMetadata(projectId, row);
      const key = await getContentKeys().current({ kind: "project", id: projectId });
      const version = key.version;
      key.bytes.fill(0);
      if (row.content_encryption_version === version && row.content_ciphertext &&
          getEncryptedStore().formatOf(getEncryptedStore().fromDatabase(row.content_ciphertext)) === 3) {
        result.unchanged++;
        continue;
      }
      const replacement = await encodeGithubIssueMetadata(projectId, row.issue_id, decoded);
      const verified = await decodeGithubIssueMetadata(projectId, { ...row, ...replacement });
      if (JSON.stringify(verified.metadata) !== JSON.stringify(decoded.metadata) ||
          JSON.stringify(verified.milestone) !== JSON.stringify(decoded.milestone)) {
        throw new Error("Issue metadata migration verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const committed = await service.rpc("migrate_github_issue_metadata", {
        ...identity, p_cipher: replacement.content_ciphertext,
        p_version: replacement.content_encryption_version,
      });
      if (committed.error) throw new Error("Unable to commit issue metadata migration");
      if (committed.data) result.migrated++; else result.conflicted++;
    } catch {
      result.failed++;
    }
  }
  return result;
}
