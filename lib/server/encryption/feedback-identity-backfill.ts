import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";
import { decodeFeedbackIdentity, decodeFeedbackOtpEmail,
  encodeFeedbackIdentity, encodeFeedbackOtpEmail, feedbackIdentityLookup,
  feedbackIdentityState, feedbackOtpEmailLookup,
  isEncryptedFeedbackIdentity } from "@/lib/server/feedback/identity-content";

type Table = "feedback_users" | "feedback_otp_codes";
type Row = { id: string; project_id?: string; email: string | null;
  name?: string | null; external_id?: string | null;
  email_lookup?: string | null; external_id_lookup?: string | null };

async function markAttempt(table: Table, row: Row) {
  const marked = await getServiceClient().rpc("mark_feedback_identity_attempt", {
    p_kind: table === "feedback_users" ? "user" : "otp",
    p_id: row.id, p_old_email: row.email,
    p_old_name: row.name ?? null,
    p_old_external: row.external_id ?? null,
    p_allow_stale: true,
  });
  if (marked.error || !marked.data) {
    throw new Error("Unable to mark feedback identity attempt");
  }
}

/** Convert or rotate a fair, bounded batch of private feedback identities. */
export async function backfillFeedbackIdentityBatch(table: Table,
  limit = 30, signal?: AbortSignal) {
  if (!isContentEncryptionEnabled()) {
    throw new Error("Feedback identity encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid feedback identity batch size");
  }
  const service = getServiceClient();
  const result = { scanned: 0, migrated: 0, unchanged: 0,
    conflicted: 0, failed: 0, interrupted: false };
  const columns = table === "feedback_users"
    ? "id,project_id,email,name,external_id,email_lookup,external_id_lookup"
    : "id,email,email_lookup";
  const { data, error } = await service.from(table).select(columns)
    .order("content_encryption_attempted_at", { ascending: true,
      nullsFirst: true }).order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan feedback identities");
  for (const row of (data ?? []) as unknown as Row[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const scope = table === "feedback_users"
        ? { kind: "project" as const, id: row.project_id! }
        : { kind: "system" as const,
          id: "00000000-0000-0000-0000-000000000000" };
      if (!scope.id) throw new Error("Missing feedback identity scope");
      const current = await getContentKeys().current(scope);
      const version = current.version;
      current.bytes.fill(0);
      if (table === "feedback_otp_codes") {
        const old = row.email;
        if (!old) throw new Error("Missing feedback OTP email");
        const clear = await decodeFeedbackOtpEmail(row.id, old);
        const lookup = await feedbackOtpEmailLookup(clear);
        const fresh = isEncryptedFeedbackIdentity(old) &&
          feedbackIdentityState(old).version === version &&
          feedbackIdentityState(old).format === 3;
        const cipher = fresh ? old : await encodeFeedbackOtpEmail(row.id, clear);
        if (await decodeFeedbackOtpEmail(row.id, cipher) !== clear) {
          throw new Error("Feedback OTP conversion failed verification");
        }
        if (signal?.aborted) { result.interrupted = true; break; }
        const write = await service.rpc("migrate_feedback_otp_email", {
          p_id: row.id, p_old_email: old, p_new_email: cipher,
          p_email_lookup: lookup,
        });
        if (write.error) throw new Error("Unable to migrate feedback OTP email");
        if (!write.data) {
          result.conflicted++;
          await markAttempt(table, row);
        }
        else if (fresh && row.email_lookup === lookup) result.unchanged++;
        else result.migrated++;
        continue;
      }
      const replacements: Record<string, string | null> = {};
      const lookups: Record<string, string | null> = {};
      for (const column of ["email", "name", "external_id"] as const) {
        const old = row[column] ?? null;
        if (old === null) continue;
        const clear = await decodeFeedbackIdentity(row.project_id!, row.id,
          column, old);
        if (clear === null) throw new Error("Missing feedback identity");
        const fresh = isEncryptedFeedbackIdentity(old) &&
          feedbackIdentityState(old).version === version &&
          feedbackIdentityState(old).format === 3;
        const cipher = fresh ? old : await encodeFeedbackIdentity(
          row.project_id!, row.id, column, clear);
        if (await decodeFeedbackIdentity(row.project_id!, row.id,
          column, cipher) !== clear) {
          throw new Error("Feedback identity conversion failed verification");
        }
        if (!fresh) replacements[column] = cipher;
        if (column !== "name") {
          const lookup = await feedbackIdentityLookup(row.project_id!,
            column, clear);
          if (row[`${column}_lookup`] !== lookup) {
            lookups[`${column}_lookup`] = lookup;
          }
        }
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const write = await service.rpc("migrate_feedback_user_identity", {
        p_id: row.id, p_old_email: row.email, p_old_name: row.name,
        p_old_external: row.external_id,
        p_new_email: replacements.email ?? null,
        p_new_name: replacements.name ?? null,
        p_new_external: replacements.external_id ?? null,
        p_email_lookup: lookups.email_lookup ?? null,
        p_external_lookup: lookups.external_id_lookup ?? null,
      });
      if (write.error) throw new Error("Unable to migrate feedback identity");
      if (!write.data) {
        result.conflicted++;
        await markAttempt(table, row);
      }
      else if (Object.keys(replacements).length || Object.keys(lookups).length)
        result.migrated++;
      else result.unchanged++;
    } catch {
      result.failed++;
      await markAttempt(table, row);
    }
  }
  return result;
}
