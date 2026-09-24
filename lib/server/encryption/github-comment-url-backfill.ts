import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeGithubCommentUrl, encodeGithubCommentUrl,
  type StoredGithubCommentUrl } from "@/lib/server/git/comment-sync-url-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys, getEncryptedStore } from "./registry";

type UrlRow = StoredGithubCommentUrl & {
  html_url_encryption_version: number;
  synced_at: string;
  issue: { project_id: string } | null;
};

/** Convert forge comment URLs with bounded, verified compare-and-swap writes. */
export async function backfillGithubCommentUrlsBatch(limit = 20,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_ISSUE_SIDECAR_ENCRYPTION_ENABLED !== "true") {
    throw new Error("GitHub comment URL encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid GitHub comment URL batch size");
  }
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("github_issue_comment_syncs")
    .select("issue_id,remote_comment_id,html_url,html_url_encryption_version,synced_at,issue:issues!inner(project_id)")
    .order("html_url_encryption_checked_at", { ascending: true, nullsFirst: true })
    .order("issue_id", { ascending: true })
    .order("remote_comment_id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan GitHub comment URLs");
  for (const row of (data ?? []) as unknown as UrlRow[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const projectId = row.issue?.project_id;
      if (!projectId || !row.issue_id || !row.remote_comment_id ||
          !Number.isSafeInteger(row.html_url_encryption_version) ||
          row.html_url_encryption_version < 0) throw new Error("Invalid comment URL scope");
      const identity = { p_issue_id: row.issue_id,
        p_remote_comment_id: row.remote_comment_id, p_project_id: projectId,
        p_old_url: row.html_url, p_old_version: row.html_url_encryption_version,
        p_old_synced_at: row.synced_at };
      const attempt = await service.rpc("migrate_github_comment_url", identity);
      if (attempt.error) throw new Error("Unable to mark comment URL attempt");
      if (!attempt.data) { result.conflicted++; continue; }
      const decoded = await decodeGithubCommentUrl(projectId, row);
      const key = await getContentKeys().current({ kind: "project", id: projectId });
      const version = key.version;
      key.bytes.fill(0);
      if (row.html_url_encryption_version === version && row.html_url &&
          getEncryptedStore().formatOf(getEncryptedStore().fromDatabase(row.html_url)) === 3) {
        result.unchanged++;
        continue;
      }
      const replacement = await encodeGithubCommentUrl(projectId, row.issue_id,
        row.remote_comment_id, decoded.html_url);
      const verified = await decodeGithubCommentUrl(projectId, { ...row, ...replacement });
      if (verified.html_url !== decoded.html_url) {
        throw new Error("GitHub comment URL migration verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const committed = await service.rpc("migrate_github_comment_url", {
        ...identity, p_url: replacement.html_url,
        p_version: replacement.html_url_encryption_version,
      });
      if (committed.error) throw new Error("Unable to commit comment URL migration");
      if (committed.data) result.migrated++; else result.conflicted++;
    } catch {
      result.failed++;
    }
  }
  return result;
}
