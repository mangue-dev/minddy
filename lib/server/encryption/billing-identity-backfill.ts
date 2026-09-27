import "server-only";
import { getServiceClient } from "@/lib/supabase-service";
import { billingFieldVersion, decodeBillingField,
  encodeBillingField } from "@/lib/server/billing-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";
type Row = { user_id: string; content_revision: number;
  email: string | null; admin_override_note: string | null };
/** Rewrite both private billing fields under one revision comparison. */
export async function backfillBillingIdentityBatch(
  limit = 25, signal?: AbortSignal,
) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_BILLING_IDENTITY_ENCRYPTION_ENABLED !== "true")
    throw new Error("Billing identity encryption is not enabled");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Invalid billing identity batch size");
  const result = { scanned: 0, migrated: 0, unchanged: 0,
    conflicted: 0, failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("billing_accounts")
    .select("user_id,content_revision,email,admin_override_note")
    .or("email.not.is.null,admin_override_note.not.is.null")
    .order("encryption_attempted_at", { ascending: true, nullsFirst: true })
    .order("user_id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan billing identity copies");
  const recordAttempt = async (row: Row) => {
    const { error: attemptError } = await service.from("billing_accounts")
      .update({ encryption_attempted_at: new Date().toISOString() })
      .eq("user_id", row.user_id);
    if (attemptError) throw new Error("Unable to record backfill attempt");
  };
  for (const row of (data ?? []) as Row[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const scope = { kind: "user" as const, id: row.user_id };
      const key = await getContentKeys().current(scope);
      const version = key.version;
      key.bytes.fill(0);
      const email = await decodeBillingField(row.user_id,"email",row.email);
      const note = await decodeBillingField(row.user_id,
        "admin_override_note",row.admin_override_note);
      const fresh = (row.email === null ||
        billingFieldVersion(row.email) === version) &&
        (row.admin_override_note === null ||
          billingFieldVersion(row.admin_override_note) === version);
      const nextEmail = row.email === null ? null
        : billingFieldVersion(row.email) === version ? row.email
          : await encodeBillingField(row.user_id,"email",email);
      const nextNote = row.admin_override_note === null ? null
        : billingFieldVersion(row.admin_override_note) === version
          ? row.admin_override_note
          : await encodeBillingField(row.user_id,"admin_override_note",note);
      if (await decodeBillingField(row.user_id,"email",nextEmail) !== email ||
          await decodeBillingField(row.user_id,"admin_override_note",nextNote)
            !== note) throw new Error("Billing identity migration mismatch");
      if (signal?.aborted) { result.interrupted = true; break; }
      const now = new Date().toISOString();
      const { data: saved, error: writeError } = await service
        .from("billing_accounts")
        .update({ email: nextEmail, admin_override_note: nextNote,
          encryption_attempted_at: now })
        .eq("user_id",row.user_id)
        .eq("content_revision",row.content_revision)
        .select("content_revision").maybeSingle();
      if (writeError) throw new Error("Unable to migrate billing identity");
      if (!saved) {
        result.conflicted++;
        await recordAttempt(row);
      } else {
        const { data: verified, error: verifyError } = await service.rpc(
          "confirm_encrypted_content", { p_family: "billing_identity",
            p_id: row.user_id, p_revision: saved.content_revision,
            p_first: nextEmail, p_second: nextNote });
        if (verifyError) throw new Error("Unable to confirm encrypted content");
        if (!verified) {
          result.conflicted++;
          await recordAttempt(row);
        } else if (fresh) result.unchanged++;
        else result.migrated++;
      }
    } catch {
      result.failed++;
      await recordAttempt(row);
    }
  }
  return result;
}
