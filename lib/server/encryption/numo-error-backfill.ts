import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeNumoError, encodeNumoError, isEncryptedNumoError,
  numoErrorState, type NumoErrorSource } from
  "@/lib/server/numo/error-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";

type Conversation = { id: string; user_id: string; error_message: string | null };
type Copy = { id: string; conversation_id: string; error_message: string | null;
  error_code?: string | null };

async function convert(conversation: Conversation, turn: Copy | null,
  occurrence: Copy | null) {
  const service = getServiceClient();
  const key = await getContentKeys().current({ kind: "user",
    id: conversation.user_id });
  const version = key.version;
  key.bytes.fill(0);
  const rewrite = async (source: NumoErrorSource, id: string,
    value: string | null) => {
    if (value === null || isEncryptedNumoError(value) &&
        numoErrorState(value).version === version &&
        numoErrorState(value).format === 3) return value;
    const clear = await decodeNumoError(conversation.user_id, source, id, value);
    const encrypted = await encodeNumoError(conversation.user_id, source, id, clear);
    if (await decodeNumoError(conversation.user_id, source, id, encrypted)
        !== clear) throw new Error("Numo error conversion mismatch");
    return encrypted;
  };
  const [nextConversation, nextTurn, nextOccurrence] = await Promise.all([
    rewrite("conversations", conversation.id, conversation.error_message),
    turn ? rewrite("numo_assistant_turns", turn.id, turn.error_message) : null,
    occurrence ? rewrite("numo_routine_occurrences", occurrence.id,
      occurrence.error_message) : null,
  ]);
  const { data, error } = await service.rpc("migrate_numo_error_bundle", {
    p_conversation_id: conversation.id,p_turn_id: turn?.id ?? null,
    p_occurrence_id: occurrence?.id ?? null,
    p_old_conversation: conversation.error_message,
    p_new_conversation: nextConversation,p_old_turn: turn?.error_message ?? null,
    p_new_turn: nextTurn,p_old_occurrence: occurrence?.error_message ?? null,
    p_new_occurrence: nextOccurrence,
    p_old_occurrence_code: occurrence?.error_code ?? null,
  });
  if (error) throw new Error("Unable to migrate Numo error bundle");
  return { committed: data === true,
    changed: nextConversation !== conversation.error_message ||
      nextTurn !== (turn?.error_message ?? null) ||
      nextOccurrence !== (occurrence?.error_message ?? null) ||
      occurrence?.error_code != null && ![
        "numo_unavailable", "usage_budget_exceeded",
      ].includes(occurrence.error_code) };
}

/** Rotate each error and its conversation copy in bounded CAS transactions. */
export async function backfillNumoErrorsBatch(limit = 30, signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_NUMO_ERROR_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Numo error encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid Numo error batch size");
  }
  const service = getServiceClient();
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  for (const source of ["numo_assistant_turns",
    "numo_routine_occurrences", "conversations"] as const) {
    const query = service.from(source)
      .select("*")
      .order("error_encryption_checked_at", { ascending: true,
        nullsFirst: true }).order("id", { ascending: true }).limit(limit);
    const { data, error } = await query;
    if (error) throw new Error("Unable to scan Numo errors");
    for (const row of data ?? []) {
      if (signal?.aborted) { result.interrupted = true; return result; }
      result.scanned++;
      try {
        const conversation = source === "conversations" ? row as Conversation
          : (await service.from("conversations")
            .select("id,user_id,error_message")
            .eq("id", (row as Copy).conversation_id).single()).data as Conversation | null;
        if (!conversation?.user_id) throw new Error("Numo error owner unavailable");
        if (source === "numo_routine_occurrences") {
          const owner = await service.from("numo_routine_occurrences")
            .select("routine:agent_routines!inner(owner_id)")
            .eq("id", row.id).single();
          const linked = owner.data?.routine as unknown as
            { owner_id: string } | { owner_id: string }[] | null;
          const ownerId = Array.isArray(linked) ? linked[0]?.owner_id
            : linked?.owner_id;
          if (owner.error || ownerId !== conversation.user_id) {
            throw new Error("Numo occurrence owner mismatch");
          }
        }
        const converted = await convert(conversation,
          source === "numo_assistant_turns" ? row as Copy : null,
          source === "numo_routine_occurrences" ? row as Copy : null);
        if (!converted.committed) result.conflicted++;
        else if (converted.changed) result.migrated++;
        else result.unchanged++;
      } catch { result.failed++; }
    }
  }
  return result;
}
