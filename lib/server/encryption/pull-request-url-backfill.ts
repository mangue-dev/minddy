import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodePullRequestUrl, encodePullRequestUrl,
  isEncryptedPullRequestUrl, pullRequestUrlState } from
  "@/lib/server/agent/pull-request-url-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";

const SCOPE = { kind: "system" as const,
  id: "00000000-0000-0000-0000-000000000000" };

/** Resume a bounded system-scope pass with a row-value CAS. */
export async function backfillPullRequestUrlsBatch(limit = 20,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_PULL_REQUEST_URL_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Pull request URL encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid pull request URL batch size");
  }
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("pull_requests")
    .select("id,url").not("url", "is", null)
    .order("url_encryption_attempted_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan pull request URLs");
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const key = await getContentKeys().current(SCOPE);
      const version = key.version;
      key.bytes.fill(0);
      const identity = { p_id: row.id, p_old_url: row.url };
      if (isEncryptedPullRequestUrl(row.url)) {
        const state = pullRequestUrlState(row.url);
        if (state.version === version && state.format === 3) {
          await decodePullRequestUrl(row.id, row.url);
          const checked = await service.rpc("migrate_pull_request_url", {
            ...identity, p_verified: true,
          });
          if (checked.error) throw new Error("Unable to mark pull request URL attempt");
          if (checked.data) result.unchanged++; else result.conflicted++;
          continue;
        }
      }
      const plain = await decodePullRequestUrl(row.id, row.url);
      if (!plain) throw new Error("Missing pull request URL");
      const replacement = await encodePullRequestUrl(row.id, plain);
      if (await decodePullRequestUrl(row.id, replacement) !== plain) {
        throw new Error("Pull request URL verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const committed = await service.rpc("migrate_pull_request_url", {
        ...identity, p_new_url: replacement,
      });
      if (committed.error) throw new Error("Unable to convert pull request URL");
      if (committed.data) result.migrated++; else result.conflicted++;
    } catch {
      result.failed++;
      const attempt = await service.rpc("migrate_pull_request_url", {
        p_id: row.id, p_old_url: row.url,
      });
      if (attempt.error) throw new Error("Unable to mark pull request URL attempt");
    }
  }
  return result;
}
