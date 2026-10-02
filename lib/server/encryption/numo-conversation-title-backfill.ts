import "server-only";

import { markNumoAttempt } from "./numo-attempt";

import { getServiceClient } from "@/lib/supabase-service";
import { conversationTitleState, decodeConversationTitle,
  encodeConversationTitle, isEncryptedConversationTitle } from
  "@/lib/server/numo/conversation-title-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";

/** Rotate assistant conversation titles through a bounded CAS queue. */
export async function backfillNumoConversationTitlesBatch(limit = 30,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled()) {
    throw new Error("Numo conversation title encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid Numo conversation title batch size");
  }
  const service = getServiceClient();
  const { data, error } = await service.from("conversations")
    .select("id,user_id,title")
    .order("title_encryption_attempted_at", { ascending: true,
      nullsFirst: true }).order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan Numo conversation titles");
  const result = { scanned: 0, migrated: 0, unchanged: 0,
    conflicted: 0, failed: 0, interrupted: false };
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const key = await getContentKeys().current({ kind: "user", id: row.user_id });
      const version = key.version;
      key.bytes.fill(0);
      const clear = await decodeConversationTitle(row.user_id, row.id, row.title);
      const fresh = row.title === null || (isEncryptedConversationTitle(row.title) &&
        conversationTitleState(row.title).version === version &&
        conversationTitleState(row.title).format === 3);
      const stored = fresh ? row.title : await encodeConversationTitle(
        row.user_id, row.id, clear);
      if ((await decodeConversationTitle(row.user_id, row.id, stored)) !== clear) {
        throw new Error("Numo conversation title conversion verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const write = await service.rpc("migrate_numo_conversation_title", {
        p_id: row.id, p_old: row.title, p_new: stored,
      });
      if (write.error) throw new Error("Unable to migrate Numo conversation title");
      if (!write.data) {
        result.conflicted++;
        await markNumoAttempt("title", row.id, { title: row.title });
      }
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch {
      result.failed++;
      await markNumoAttempt("title", row.id, { title: row.title });
    }
  }
  return result;
}
