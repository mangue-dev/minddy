import "server-only";

import { isDeepStrictEqual } from "node:util";
import { getServiceClient } from "@/lib/supabase-service";
import { decodeForgeOAuthTokens, encodeForgeOAuthTokens,
  type ForgeOAuthTable, type ForgeOAuthTokenRow } from
  "@/lib/server/git/forge-oauth-token-content";
import { getContentKeys, getEncryptedStore } from "./registry";
import { isContentEncryptionEnabled } from "./content-config";

type QueueRow = ForgeOAuthTokenRow & { id: string;
  content_revision: number; oauth_refresh_claim?: string | null;
  oauth_refresh_claimed_at?: string | null };

async function backfill(table: ForgeOAuthTable,limit: number,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled()) {
    throw new Error("Forge OAuth token encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid forge OAuth token batch size");
  }
  const service = getServiceClient();
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  let query = service.from(table).select("*");
  if (table === "git_connections") {
    query = query.or("provider.eq.gitlab,access_token_encrypted.not.is.null,encrypted_content.not.is.null");
  }
  const { data, error } = await query
    .order("encryption_attempted_at",{ ascending: true, nullsFirst: true })
    .order("id",{ ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan forge OAuth tokens");
  for (const row of (data ?? []) as QueueRow[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    const revision = row.content_revision;
    try {
      if (row.oauth_refresh_claim) {
        const age = row.oauth_refresh_claimed_at
          ? Date.now()-Date.parse(row.oauth_refresh_claimed_at)
          : Number.POSITIVE_INFINITY;
        if (age<120_000) {
          result.conflicted++;
          await service.from(table)
            .update({ encryption_attempted_at: new Date().toISOString() })
            .eq("id",row.id).eq("content_revision",revision);
          continue;
        }
        const release = await service.from(table)
          .update({ oauth_refresh_claim: null,
            oauth_refresh_claimed_at: null })
          .eq("id",row.id).eq("oauth_refresh_claim",row.oauth_refresh_claim)
          .eq("content_revision",revision).select("id").maybeSingle();
        if (release.error || !release.data) {
          result.conflicted++;
          continue;
        }
      }
      const scope = { kind: "user" as const,id:row.user_id };
      const key = await getContentKeys().current(scope);
      const currentVersion = key.version;
      key.bytes.fill(0);
      const tokens = await decodeForgeOAuthTokens(table,row);
      if (!tokens.accessToken) throw new Error("Unreadable forge OAuth token");
      const store = getEncryptedStore();
      const fresh = row.encryption_version === currentVersion &&
        typeof row.encrypted_content === "string" &&
        store.formatOf(store.fromDatabase(row.encrypted_content)) === 3;
      const encoded = fresh ? row : await encodeForgeOAuthTokens(table,row,
        { accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken },{ service, force: true });
      if (!isDeepStrictEqual(await decodeForgeOAuthTokens(table,
        { ...row,...encoded }),tokens)) {
        throw new Error("Forge OAuth token migration mismatch");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const now = new Date().toISOString();
      const write = await service.from(table)
        .update(fresh
          ? { encryption_checked_at: now,encryption_attempted_at: now }
          : { ...encoded,encryption_checked_at: now,
            encryption_attempted_at: now })
        .eq("id",row.id).eq("content_revision",revision)
        .is("oauth_refresh_claim",null).select("id").maybeSingle();
      if (write.error) throw new Error("Unable to migrate forge OAuth tokens");
      if (!write.data) {
        result.conflicted++;
        await service.from(table)
          .update({ encryption_attempted_at: new Date().toISOString() })
          .eq("id",row.id).eq("content_revision",revision);
      }
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch {
      result.failed++;
      if (signal?.aborted) { result.interrupted = true; break; }
      await service.from(table)
        .update({ encryption_attempted_at: new Date().toISOString() })
        .eq("id",row.id).eq("content_revision",revision);
    }
  }
  return result;
}

export const backfillForgeOAuthConnectionsBatch =
  (limit = 25,signal?: AbortSignal) => backfill("git_connections",limit,signal);
export const backfillForgeOAuthIdentitiesBatch =
  (limit = 25,signal?: AbortSignal) => backfill("git_user_identities",limit,signal);
