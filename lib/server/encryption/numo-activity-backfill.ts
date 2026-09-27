import "server-only";

import { markNumoAttempt } from "./numo-attempt";

import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";
import { decodeNumoTurnEvent, encodeNumoTurnEvent,
  isEncryptedNumoTurnEvent, numoTurnEventState } from
  "@/lib/server/numo/turn-event-content";

/** Convert and rotate the durable Numo activity journal in a bounded CAS pass. */
export async function backfillNumoActivityBatch(limit = 30,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_NUMO_EVENT_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Numo activity encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid Numo activity batch size");
  }
  const service = getServiceClient();
  const { data, error } = await service.from("numo_turn_events")
    .select("id,turn_id,type,payload,turn:numo_assistant_turns!inner(user_id)")
    .not("type", "in", "(worker_completed,worker_failed,worker_input)")
    .order("payload_user_encryption_attempted_at", { ascending: true,
      nullsFirst: true }).order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan Numo activity");
  const result = { scanned: 0, migrated: 0, unchanged: 0,
    conflicted: 0, failed: 0, interrupted: false };
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const joined = row.turn as unknown as { user_id?: string } | null;
      const userId = joined?.user_id;
      if (!userId || !row.payload || typeof row.payload !== "object" ||
          Array.isArray(row.payload)) throw new Error("Invalid Numo activity row");
      const scope = { kind: "user" as const, id: userId };
      const key = await getContentKeys().current(scope);
      const version = key.version;
      key.bytes.fill(0);
      const expected = { userId, turnId: row.turn_id, eventId: row.id };
      const clear = await decodeNumoTurnEvent(row.payload, expected);
      const fresh = isEncryptedNumoTurnEvent(row.payload) &&
        numoTurnEventState(row.payload).version === version &&
        numoTurnEventState(row.payload).format === 3;
      const stored = fresh ? row.payload : await encodeNumoTurnEvent(
        userId, row.turn_id, row.id, clear);
      if (JSON.stringify(await decodeNumoTurnEvent(stored, expected)) !==
          JSON.stringify(clear)) {
        throw new Error("Numo activity conversion verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const write = await service.rpc("migrate_numo_activity_payload", {
        p_id: row.id, p_old: row.payload, p_new: stored,
      });
      if (write.error) throw new Error("Unable to migrate Numo activity");
      if (!write.data) {
        result.conflicted++;
        await markNumoAttempt("activity", row.id, { payload: row.payload });
      }
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch {
      result.failed++;
      await markNumoAttempt("activity", row.id, { payload: row.payload });
    }
  }
  return result;
}
