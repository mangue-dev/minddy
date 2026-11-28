import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import {
  BRANCH_CONTENT_FIELDS,
  codeWorkContentState,
  COMMIT_CONTENT_FIELDS,
  decodeCodeWorkContent,
  encodeCodeWorkContent,
  isEncryptedCodeWorkContent,
  type CodeWorkTable,
} from "@/lib/server/git/commit-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";

const SCOPE = { kind: "system" as const,
  id: "00000000-0000-0000-0000-000000000000" };

const FIELDS: Record<CodeWorkTable, readonly string[]> = {
  issue_commits: COMMIT_CONTENT_FIELDS,
  issue_branches: BRANCH_CONTENT_FIELDS,
};

/**
 * Seals the commit and branch content written before encryption was active,
 * and moves sealed values to the current key (MIN-1037). The least recently
 * checked rows come first; a row is rewritten only if its stored values are
 * still the ones that were read.
 */
export async function backfillIssueCodeWorkBatch(table: CodeWorkTable, limit = 20,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled()) {
    throw new Error("Issue code work encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid issue code work batch size");
  }
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const fields = FIELDS[table];
  const service = getServiceClient();
  // Literal table names: the access checks read them from the source.
  const rows = () => table === "issue_commits"
    ? service.from("issue_commits") : service.from("issue_branches");
  const { data, error } = await rows()
    .select(["id", ...fields].join(","))
    .order("content_checked_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan issue code work content");
  for (const row of (data ?? []) as unknown as Array<Record<string, string | null> & { id: string }>) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    const checkedAt = new Date().toISOString();
    try {
      const key = await getContentKeys().current(SCOPE);
      const version = key.version;
      key.bytes.fill(0);
      const replacements: Record<string, string> = {};
      for (const field of fields) {
        const stored = row[field];
        if (stored === null) continue;
        if (isEncryptedCodeWorkContent(stored)) {
          const state = codeWorkContentState(stored);
          if (state.version === version && state.format === 3) {
            await decodeCodeWorkContent(table, row.id, field, stored);
            continue;
          }
        }
        const plain = await decodeCodeWorkContent(table, row.id, field, stored);
        if (!plain) throw new Error("Missing issue code work content");
        const cipher = await encodeCodeWorkContent(table, row.id, field, plain);
        if (await decodeCodeWorkContent(table, row.id, field, cipher) !== plain) {
          throw new Error("Issue code work content verification failed");
        }
        replacements[field] = cipher;
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      // Compare-and-swap on the values that were read.
      let update = rows()
        .update({ ...replacements, content_checked_at: checkedAt }).eq("id", row.id);
      for (const field of fields) {
        const stored = row[field];
        update = stored === null ? update.is(field, null) : update.eq(field, stored);
      }
      const committed = await update.select("id");
      if (committed.error) throw new Error("Unable to convert issue code work content");
      if (!committed.data?.length) result.conflicted++;
      else if (Object.keys(replacements).length > 0) result.migrated++;
      else result.unchanged++;
    } catch {
      result.failed++;
      const attempt = await rows()
        .update({ content_checked_at: checkedAt }).eq("id", row.id);
      if (attempt.error) throw new Error("Unable to mark issue code work attempt");
    }
  }
  return result;
}
