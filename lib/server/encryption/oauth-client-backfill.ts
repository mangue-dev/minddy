import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";
import { decodeOAuthClientContent, encodeOAuthClientContent,
  type StoredOAuthClient } from "@/lib/server/oauth/client-content";

type Row = StoredOAuthClient & { content_revision: number;
  encryption_checked_at: string | null };

/** Verify and rotate a bounded OAuth client batch under exact revision CAS. */
export async function backfillOAuthClientsBatch(limit = 25, signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_OAUTH_CLIENT_ENCRYPTION_ENABLED !== "true")
    throw new Error("OAuth client encryption is not enabled");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Invalid OAuth client batch size");
  const result = { scanned: 0, migrated: 0, unchanged: 0,
    conflicted: 0, failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("oauth_clients")
    .select("client_id, client_name, redirect_uris, logo_uri, client_uri, encrypted_content, encryption_version, content_revision, encryption_checked_at, created_at")
    .order("encryption_attempted_at", { ascending: true, nullsFirst: true })
    .order("client_id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan OAuth clients");
  for (const row of (data ?? []) as Row[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const key = await getContentKeys().current({ kind: "system",
        id: "00000000-0000-0000-0000-000000000000" });
      const currentVersion = key.version;
      key.bytes.fill(0);
      const content = await decodeOAuthClientContent(row);
      const fresh = row.encryption_version === currentVersion &&
        !!row.encryption_checked_at;
      const encoded = fresh
        ? { encrypted_content: row.encrypted_content!,
            encryption_version: row.encryption_version! }
        : await encodeOAuthClientContent(row.client_id, content);
      const replacement: Row = { ...row, ...encoded, client_name: null,
        redirect_uris: null, logo_uri: null, client_uri: null };
      if (JSON.stringify(await decodeOAuthClientContent(replacement)) !==
          JSON.stringify(content)) throw new Error("OAuth client migration mismatch");
      if (signal?.aborted) { result.interrupted = true; break; }
      const now = new Date().toISOString();
      let query = service.from("oauth_clients").update({ ...encoded,
        client_name: null, redirect_uris: null, logo_uri: null, client_uri: null,
        encryption_checked_at: now, encryption_attempted_at: now })
        .eq("client_id", row.client_id).eq("content_revision", row.content_revision);
      query = row.encrypted_content === null || row.encrypted_content === undefined
        ? query.is("encrypted_content", null)
        : query.eq("encrypted_content", row.encrypted_content);
      const { data: saved, error: writeError } = await query
        .select("client_id").maybeSingle();
      if (writeError) throw new Error("Unable to migrate OAuth client");
      if (!saved) result.conflicted++;
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch {
      result.failed++;
      await service.from("oauth_clients")
        .update({ encryption_attempted_at: new Date().toISOString() })
        .eq("client_id", row.client_id).eq("content_revision", row.content_revision);
    }
  }
  return result;
}
