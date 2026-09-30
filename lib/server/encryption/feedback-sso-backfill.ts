import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";
import { boardSsoState, decodeBoardSso, encodeBoardSso,
  isEncryptedBoardSso } from "@/lib/server/feedback/board-sso-content";

async function markAttempt(id: string, old: string | null) {
  const marked = await getServiceClient().rpc("mark_feedback_sso_attempt", {
    p_id: id, p_old: old, p_allow_stale: true,
  });
  if (marked.error || !marked.data) {
    throw new Error("Unable to mark feedback SSO attempt");
  }
}

/** Replace legacy board secrets and rotate project keys in a bounded CAS pass. */
export async function backfillFeedbackSsoBatch(limit = 30,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled()) {
    throw new Error("Feedback SSO root encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid feedback SSO batch size");
  }
  const service = getServiceClient();
  const { data, error } = await service.from("feedback_boards")
    .select("id,project_id,sso_secret")
    .not("sso_secret", "is", null)
    .order("sso_encryption_attempted_at", { ascending: true,
      nullsFirst: true }).order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan feedback SSO secrets");
  const result = { scanned: 0, migrated: 0, unchanged: 0,
    conflicted: 0, failed: 0, interrupted: false };
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      if (!row.sso_secret) throw new Error("Missing feedback SSO secret");
      const scope = { kind: "project" as const, id: row.project_id };
      const current = await getContentKeys().current(scope);
      const version = current.version;
      current.bytes.fill(0);
      const clear = await decodeBoardSso(row.project_id, row.id,
        row.sso_secret);
      if (!clear) throw new Error("Unable to read feedback SSO secret");
      const fresh = isEncryptedBoardSso(row.sso_secret) &&
        boardSsoState(row.sso_secret).version === version &&
        boardSsoState(row.sso_secret).format === 3;
      const cipher = fresh ? row.sso_secret : await encodeBoardSso(
        row.project_id, row.id, clear);
      if (await decodeBoardSso(row.project_id, row.id, cipher) !== clear) {
        throw new Error("Feedback SSO conversion verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const write = await service.rpc("migrate_feedback_sso_secret", {
        p_id: row.id, p_old: row.sso_secret, p_new: cipher,
      });
      if (write.error) throw new Error("Unable to migrate feedback SSO secret");
      if (!write.data) {
        result.conflicted++;
        await markAttempt(row.id, row.sso_secret);
      }
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch {
      result.failed++;
      await markAttempt(row.id, row.sso_secret);
    }
  }
  return result;
}
