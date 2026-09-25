import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeNumoUserMessage, encodeNumoUserMessage,
  numoUserMessageState } from "@/lib/server/numo/user-message-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";

/** Rotate user messages through a bounded, row-locked compare-and-swap queue. */
export async function backfillNumoUserMessagesBatch(limit = 30,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_NUMO_USER_MESSAGE_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Numo user message encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid Numo user message batch size");
  }
  const service = getServiceClient();
  const { data, error } = await service.from("assistant_messages")
    .select("id,content,context,metadata,tool_calls,tool_call_id,tool_name,user_payload_version,conversation:conversations!inner(user_id)")
    .eq("role", "user").eq("worker_content_encryption_version", 0)
    .order("user_payload_checked_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan Numo user messages");
  const result = { scanned: 0, migrated: 0, unchanged: 0,
    conflicted: 0, failed: 0, interrupted: false };
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const joined = Array.isArray(row.conversation)
        ? row.conversation[0] : row.conversation;
      const userId = joined?.user_id;
      if (!userId) throw new Error("Numo user message owner missing");
      const key = await getContentKeys().current({ kind: "user", id: userId });
      const version = key.version;
      key.bytes.fill(0);
      const clear = await decodeNumoUserMessage(userId, row);
      const state = row.user_payload_version > 0 && row.content
        ? numoUserMessageState(row.content) : null;
      const fresh = state?.version === version && state.format === 3;
      const stored = fresh ? { content: row.content, user_payload_version: version }
        : await encodeNumoUserMessage(userId, row.id, {
            content: clear.content,
            context: clear.context,
            metadata: clear.metadata,
            tool_calls: clear.tool_calls,
            tool_call_id: clear.tool_call_id,
            tool_name: clear.tool_name,
          });
      const checked = await decodeNumoUserMessage(userId, {
        id: row.id, content: stored.content, context: null, metadata: {},
        tool_calls: null, tool_call_id: null, tool_name: null,
        user_payload_version: stored.user_payload_version,
      });
      if (JSON.stringify([checked.content, checked.context, checked.metadata,
          checked.tool_calls, checked.tool_call_id, checked.tool_name]) !==
          JSON.stringify([clear.content, clear.context, clear.metadata,
            clear.tool_calls, clear.tool_call_id, clear.tool_name])) {
        throw new Error("Numo user message conversion verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const write = await service.rpc("migrate_numo_user_message", {
        p_id: row.id, p_old_content: row.content, p_old_context: row.context,
        p_old_metadata: row.metadata, p_old_version: row.user_payload_version,
        p_old_tool_calls: row.tool_calls, p_old_tool_call_id: row.tool_call_id,
        p_old_tool_name: row.tool_name,
        p_new_content: stored.content, p_new_version: stored.user_payload_version,
      });
      if (write.error) throw new Error("Unable to migrate Numo user message");
      if (!write.data) result.conflicted++;
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch { result.failed++; }
  }
  return result;
}
