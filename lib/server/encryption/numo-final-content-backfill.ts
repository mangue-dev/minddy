import "server-only";

import { markNumoAttempt } from "./numo-attempt";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeNumoFinalMessage, decodeNumoTurnOutcome,
  encodeNumoFinalMessage, encodeNumoTurnOutcome,
  isEncryptedNumoTurnOutcome, numoFinalMessageState,
  numoTurnOutcomeState } from
  "@/lib/server/numo/final-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";

type FinalRow = { id: string; conversation_id: string; turn_id: string | null;
  content: string | null; context: unknown; metadata: unknown;
  tool_call_id: string | null; tool_name: string | null;
  final_payload_version: number };

function expectedMessage(row: FinalRow) {
  return { content: row.content, context: row.context, metadata: row.metadata,
    tool_call_id: row.tool_call_id, tool_name: row.tool_name,
    version: row.final_payload_version };
}

async function convert(input: { turn: { id: string; user_id: string;
  conversation_id: string; outcome: string | null } | null;
  message: FinalRow | null; userId: string; keyVersion: number }) {
  const service = getServiceClient();
  const { turn, message, userId, keyVersion } = input;
  if (turn && message && message.conversation_id !== turn.conversation_id) {
    throw new Error("Numo final copy scope mismatch");
  }
  const clearOutcome = turn ? await decodeNumoTurnOutcome(userId, turn.id,
    turn.outcome) : null;
  const clearMessage = message ? await decodeNumoFinalMessage(userId, message) : null;
  const freshOutcome = !turn?.outcome ||
    (isEncryptedNumoTurnOutcome(turn.outcome) &&
      numoTurnOutcomeState(turn.outcome).version === keyVersion &&
      numoTurnOutcomeState(turn.outcome).format === 3);
  const freshMessage = !message || message.final_payload_version > 0 &&
    !!message.content && numoFinalMessageState(message.content).version === keyVersion &&
    numoFinalMessageState(message.content).format === 3;
  const nextOutcome = !turn || freshOutcome ? turn?.outcome ?? null
    : await encodeNumoTurnOutcome(userId, turn.id, clearOutcome);
  const nextMessage = !message ? null : freshMessage
    ? { content: message.content, version: message.final_payload_version }
    : await encodeNumoFinalMessage(userId, message.id, {
        content: clearMessage!.content, context: clearMessage!.context,
        metadata: clearMessage!.metadata,
        tool_call_id: clearMessage!.tool_call_id,
        tool_name: clearMessage!.tool_name,
      }).then((stored) => ({ content: stored.content,
        version: stored.final_payload_version }));
  if (turn && await decodeNumoTurnOutcome(userId, turn.id, nextOutcome) !==
      clearOutcome) throw new Error("Numo turn outcome conversion mismatch");
  if (message && nextMessage) {
    const checked = await decodeNumoFinalMessage(userId, {
      id: message.id, content: nextMessage.content, context: null, metadata: {},
      tool_call_id: null, tool_name: null,
      final_payload_version: nextMessage.version,
    });
    if (JSON.stringify([checked.content, checked.context, checked.metadata,
        checked.tool_call_id, checked.tool_name]) !==
        JSON.stringify([clearMessage!.content, clearMessage!.context,
          clearMessage!.metadata, clearMessage!.tool_call_id,
          clearMessage!.tool_name])) {
      throw new Error("Numo final message conversion mismatch");
    }
  }
  const { data, error } = await service.rpc("migrate_numo_final_content", {
    p_turn_id: turn?.id ?? null, p_message_id: message?.id ?? null,
    p_old_message: message ? expectedMessage(message) : null,
    p_new_message: nextMessage, p_old_outcome: turn?.outcome ?? null,
    p_new_outcome: nextOutcome,
  });
  if (error) throw new Error("Unable to migrate Numo final content");
  return { changed: !freshOutcome || !freshMessage, committed: data === true };
}

/** Migrate linked final messages with their outcome in one SQL transaction. */
export async function backfillNumoFinalContentBatch(limit = 30,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled()) {
    throw new Error("Numo final content encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid Numo final content batch size");
  }
  const service = getServiceClient();
  const result = { scanned: 0, migrated: 0, unchanged: 0,
    conflicted: 0, failed: 0, interrupted: false };
  const turns = await service.from("numo_assistant_turns")
    .select("id,user_id,conversation_id,outcome")
    .order("outcome_encryption_attempted_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (turns.error) throw new Error("Unable to scan Numo turn outcomes");
  for (const turn of turns.data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const read = await service.from("assistant_messages")
        .select("id,conversation_id,turn_id,content,context,metadata,tool_call_id,tool_name,final_payload_version")
        .eq("turn_id", turn.id).eq("role", "assistant")
        .is("tool_calls", null).eq("tool_payload_version", 0).maybeSingle();
      if (read.error) throw new Error("Unable to read Numo final copy");
      const key = await getContentKeys().current({ kind: "user", id: turn.user_id });
      const version = key.version;
      key.bytes.fill(0);
      const outcome = await convert({ turn, message: read.data as FinalRow | null,
        userId: turn.user_id, keyVersion: version });
      if (!outcome.committed) {
        result.conflicted++;
        await markNumoAttempt("outcome", turn.id, { outcome: turn.outcome });
      }
      else if (outcome.changed) result.migrated++;
      else result.unchanged++;
    } catch {
      result.failed++;
      await markNumoAttempt("outcome", turn.id, { outcome: turn.outcome });
    }
  }
  if (result.interrupted) return result;
  const standalone = await service.from("assistant_messages")
    .select("id,conversation_id,turn_id,content,context,metadata,tool_call_id,tool_name,final_payload_version,conversation:conversations!inner(user_id)")
    .eq("role", "assistant").is("tool_calls", null)
    .eq("tool_payload_version", 0).is("turn_id", null)
    .order("final_payload_attempted_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (standalone.error) throw new Error("Unable to scan standalone Numo answers");
  for (const row of standalone.data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const joined = Array.isArray(row.conversation)
        ? row.conversation[0] : row.conversation;
      const userId = joined?.user_id;
      if (!userId) throw new Error("Standalone Numo answer owner missing");
      const key = await getContentKeys().current({ kind: "user", id: userId });
      const version = key.version;
      key.bytes.fill(0);
      const outcome = await convert({ turn: null, message: row as FinalRow,
        userId, keyVersion: version });
      if (!outcome.committed) {
        result.conflicted++;
        await markNumoAttempt("final_message", row.id, { content: row.content, context: row.context, metadata: row.metadata, tool_call_id: row.tool_call_id, tool_name: row.tool_name, final_payload_version: row.final_payload_version });
      }
      else if (outcome.changed) result.migrated++;
      else result.unchanged++;
    } catch {
      result.failed++;
      await markNumoAttempt("final_message", row.id, { content: row.content, context: row.context, metadata: row.metadata, tool_call_id: row.tool_call_id, tool_name: row.tool_name, final_payload_version: row.final_payload_version });
    }
  }
  return result;
}
