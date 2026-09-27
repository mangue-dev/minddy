import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { recordBackfillAttempt } from "./backfill-attempt";
import { decodePrCommentEdit, encodePrCommentEdit,
  isEncryptedPrCommentEdit, prCommentEditState } from
  "@/lib/server/agent/pr-comment-edit-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";

const SCOPE = { kind: "system" as const,
  id: "00000000-0000-0000-0000-000000000000" };

/** Bounded, resumable PR comment edit conversion and key rotation. */
export async function backfillPrCommentEditsBatch(limit = 20,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_PR_COMMENT_EDIT_ENCRYPTION_ENABLED !== "true") {
    throw new Error("PR comment edit encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid PR comment edit batch size");
  }
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("pr_comment_edits")
    .select("id,body")
    .order("body_encryption_attempted_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan PR comment edits");
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      if (!await recordBackfillAttempt(service, "pr_comment_edits",
        "body_encryption_attempted_at", { id: row.id, body: row.body })) {
        result.conflicted++;
        continue;
      }
      const key = await getContentKeys().current(SCOPE);
      const version = key.version;
      key.bytes.fill(0);
      const identity = { p_id: row.id, p_old_body: row.body };
      const plain = await decodePrCommentEdit(row.id, row.body);
      if (isEncryptedPrCommentEdit(row.body)) {
        const state = prCommentEditState(row.body);
        if (state.version === version && state.format === 3) {
          const checked = await service.rpc("migrate_pr_comment_edit_body", identity);
          if (checked.error) throw new Error("Unable to mark PR comment edit attempt");
          if (checked.data) result.unchanged++; else result.conflicted++;
          continue;
        }
      }
      const replacement = await encodePrCommentEdit(row.id, plain);
      if (await decodePrCommentEdit(row.id, replacement) !== plain) {
        throw new Error("PR comment edit verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const committed = await service.rpc("migrate_pr_comment_edit_body", {
        ...identity, p_new_body: replacement,
      });
      if (committed.error) throw new Error("Unable to convert PR comment edit");
      if (committed.data) result.migrated++; else result.conflicted++;
    } catch { result.failed++; }
  }
  return result;
}
