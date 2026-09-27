import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { recordBackfillAttempt } from "./backfill-attempt";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";
import { decodeShareToken, encodeShareToken, isEncryptedShareToken,
  shareTokenLookup, shareTokenState } from "./share-token-content";

const SCOPE = { kind: "system" as const,
  id: "00000000-0000-0000-0000-000000000000" };

/** Rotate a bounded, fair batch. The SQL write compares the original token. */
export async function backfillShareTokensBatch(limit = 30,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_SHARE_TOKEN_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Share token encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid share token batch size");
  }
  const service = getServiceClient();
  const { data, error } = await service.from("view_shares")
    .select("id,token,token_lookup")
    .order("content_encryption_attempted_at", { ascending: true,
      nullsFirst: true }).order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan share tokens");
  const result = { scanned: 0, migrated: 0, unchanged: 0,
    conflicted: 0, failed: 0, interrupted: false };
  const current = await getContentKeys().current(SCOPE);
  const currentVersion = current.version;
  current.bytes.fill(0);
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      if (!await recordBackfillAttempt(service, "view_shares",
        "content_encryption_attempted_at", { id: row.id, token: row.token, token_lookup: row.token_lookup })) {
        result.conflicted++;
        continue;
      }
      const clear = await decodeShareToken(row.id, row.token);
      const lookup = await shareTokenLookup(clear);
      const fresh = isEncryptedShareToken(row.token) &&
        shareTokenState(row.token).version === currentVersion &&
        shareTokenState(row.token).format === 3;
      const cipher = fresh ? row.token : await encodeShareToken(row.id, clear);
      if (await decodeShareToken(row.id, cipher) !== clear) {
        throw new Error("Share token conversion verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const write = await service.rpc("migrate_view_share_token", {
        p_id: row.id, p_old_token: row.token, p_new_token: cipher,
        p_token_lookup: lookup,
      });
      if (write.error) throw new Error("Unable to migrate share token");
      if (!write.data) result.conflicted++;
      else if (fresh && row.token_lookup === lookup) result.unchanged++;
      else result.migrated++;
    } catch { result.failed++; }
  }
  return result;
}
