import "server-only";
import { getServiceClient } from "@/lib/supabase-service";
import { decodeOAuthCodeContent, encodeOAuthCodeContent,
  type StoredOAuthCode } from "@/lib/server/oauth/code-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";
type Row = StoredOAuthCode & { content_revision: number;
  encryption_checked_at: string | null };
/** Rotate active or retained one-time codes with an exact content revision. */
export async function backfillOAuthCodesBatch(limit = 25, signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_OAUTH_CODE_ENCRYPTION_ENABLED !== "true")
    throw new Error("OAuth code encryption is not enabled");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Invalid OAuth code batch size");
  const result = { scanned: 0, migrated: 0, unchanged: 0,
    conflicted: 0, failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("oauth_authorization_codes")
    .select("code_hash,user_id,redirect_uri,resource,encrypted_content,encryption_version,content_revision,encryption_checked_at")
    .order("encryption_attempted_at", { ascending: true, nullsFirst: true })
    .order("code_hash", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan OAuth codes");
  const recordAttempt = async (row: Row) => {
    const { error: attemptError } = await service.from("oauth_authorization_codes")
      .update({ encryption_attempted_at: new Date().toISOString() })
      .eq("code_hash", row.code_hash);
    if (attemptError) throw new Error("Unable to record backfill attempt");
  };
  for (const row of (data ?? []) as Row[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const scope = { kind: "user" as const, id: row.user_id };
      const key = await getContentKeys().current(scope);
      const currentVersion = key.version;
      key.bytes.fill(0);
      const content = await decodeOAuthCodeContent(row);
      const fresh = row.encryption_version === currentVersion &&
        !!row.encryption_checked_at;
      const encoded = fresh
        ? { encrypted_content: row.encrypted_content!,
            encryption_version: row.encryption_version! }
        : await encodeOAuthCodeContent(row, content);
      const replacement: Row = { ...row, ...encoded,
        redirect_uri: null, resource: null };
      if (JSON.stringify(await decodeOAuthCodeContent(replacement)) !==
          JSON.stringify(content)) throw new Error("OAuth code migration mismatch");
      if (signal?.aborted) { result.interrupted = true; break; }
      const now = new Date().toISOString();
      let query = service.from("oauth_authorization_codes")
        .update({ ...encoded, redirect_uri: null, resource: null,
          encryption_attempted_at: now })
        .eq("code_hash", row.code_hash).eq("user_id", row.user_id)
        .eq("content_revision", row.content_revision);
      query = row.encrypted_content === null || row.encrypted_content === undefined
        ? query.is("encrypted_content", null)
        : query.eq("encrypted_content", row.encrypted_content);
      const { data: saved, error: writeError } = await query
        .select("content_revision").maybeSingle();
      if (writeError) throw new Error("Unable to migrate OAuth code");
      if (!saved) {
        result.conflicted++;
        await recordAttempt(row);
      } else {
        const { data: verified, error: verifyError } = await service.rpc(
          "confirm_encrypted_content", { p_family: "oauth_code",
            p_id: row.code_hash, p_revision: saved.content_revision,
            p_first: encoded.encrypted_content, p_second: null });
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
