import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodePullRequestContent, encodePullRequestContent,
  isEncryptedPullRequestContent, PR_CONTENT_FIELDS,
  pullRequestContentState } from "@/lib/server/agent/pull-request-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";

const SCOPE = { kind: "system" as const,
  id: "00000000-0000-0000-0000-000000000000" };

/** Rotate all three PR content fields under one row-value CAS. */
export async function backfillPullRequestContentBatch(limit = 20,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled()) {
    throw new Error("Pull request content encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid pull request content batch size");
  }
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("pull_requests")
    .select("id,title,head_branch,base_branch")
    .or("title.not.is.null,head_branch.not.is.null,base_branch.not.is.null")
    .order("content_encryption_attempted_at", { ascending: true,
      nullsFirst: true }).order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan pull request content");
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const key = await getContentKeys().current(SCOPE);
      const version = key.version;
      key.bytes.fill(0);
      const replacements: Record<string, string | null> = {};
      for (const field of PR_CONTENT_FIELDS) {
        const stored = row[field];
        if (stored === null) { replacements[field] = null; continue; }
        if (isEncryptedPullRequestContent(stored)) {
          const state = pullRequestContentState(stored);
          if (state.version === version && state.format === 3) {
            await decodePullRequestContent(row.id, field, stored);
            replacements[field] = null;
            continue;
          }
        }
        const plain = await decodePullRequestContent(row.id, field, stored);
        if (!plain) throw new Error("Missing pull request content");
        const cipher = await encodePullRequestContent(row.id, field, plain);
        if (await decodePullRequestContent(row.id, field, cipher) !== plain) {
          throw new Error("Pull request content verification failed");
        }
        replacements[field] = cipher;
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const changed = PR_CONTENT_FIELDS.some((field) => replacements[field] !== null);
      const committed = await service.rpc("migrate_pull_request_content", {
        p_id: row.id, p_old_title: row.title, p_old_head: row.head_branch,
        p_old_base: row.base_branch,
        ...(changed ? { p_new_title: replacements.title,
          p_new_head: replacements.head_branch,
          p_new_base: replacements.base_branch } : { p_verified: true }),
      });
      if (committed.error) throw new Error("Unable to convert pull request content");
      if (!committed.data) result.conflicted++;
      else if (changed) result.migrated++;
      else result.unchanged++;
    } catch {
      result.failed++;
      const attempt = await service.rpc("migrate_pull_request_content", {
        p_id: row.id, p_old_title: row.title, p_old_head: row.head_branch,
        p_old_base: row.base_branch,
      });
      if (attempt.error) throw new Error("Unable to mark pull request content attempt");
    }
  }
  return result;
}
