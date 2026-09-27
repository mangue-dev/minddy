import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeNumoTurnIntent, encodeNumoTurnIntent,
  isEncryptedTurnIntent, numoTurnIntentState } from
  "@/lib/server/numo/turn-intent-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";

/** Rotate admission snapshots through a bounded, row-locked CAS queue. */
export async function backfillNumoTurnIntentsBatch(limit = 30,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_NUMO_TURN_INTENT_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Numo turn intent encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid Numo turn intent batch size");
  }
  const service = getServiceClient();
  const { data, error } = await service.from("numo_assistant_turns")
    .select("id,user_id,conversation_id,request_id,intent")
    .order("intent_encryption_attempted_at", { ascending: true,
      nullsFirst: true }).order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan Numo turn intents");
  const result = { scanned: 0, migrated: 0, unchanged: 0,
    conflicted: 0, failed: 0, interrupted: false };
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      if (!row.intent || typeof row.intent !== "object" ||
          Array.isArray(row.intent)) throw new Error("Invalid Numo turn intent row");
      const key = await getContentKeys().current({ kind: "user", id: row.user_id });
      const version = key.version;
      key.bytes.fill(0);
      const expected = { userId: row.user_id,
        conversationId: row.conversation_id, requestId: row.request_id };
      const clear = await decodeNumoTurnIntent(row.intent, expected);
      const fresh = isEncryptedTurnIntent(row.intent) &&
        numoTurnIntentState(row.intent).version === version &&
        numoTurnIntentState(row.intent).format === 3;
      const stored = fresh ? row.intent : await encodeNumoTurnIntent(
        row.user_id, row.conversation_id, row.request_id, clear);
      if (JSON.stringify(await decodeNumoTurnIntent(stored, expected)) !==
          JSON.stringify(clear)) {
        throw new Error("Numo turn intent conversion verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const write = await service.rpc("migrate_numo_turn_intent", {
        p_id: row.id, p_old: row.intent, p_new: stored,
      });
      if (write.error) throw new Error("Unable to migrate Numo turn intent");
      if (!write.data) {
        result.conflicted++;
        const marked = await service.rpc("mark_numo_turn_intent_attempt", {
          p_id: row.id, p_old: row.intent,
        });
        if (marked.error) throw new Error("Unable to mark Numo intent attempt");
      }
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch {
      result.failed++;
      const marked = await service.rpc("mark_numo_turn_intent_attempt", {
        p_id: row.id, p_old: row.intent,
      });
      if (marked.error) throw new Error("Unable to mark Numo intent attempt");
    }
  }
  return result;
}
