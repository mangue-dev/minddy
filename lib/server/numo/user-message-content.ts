import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

type UserMessagePayload = {
  content: string | null;
  context: unknown;
  metadata: unknown;
  tool_calls: unknown | null;
  tool_call_id: string | null;
  tool_name: string | null;
};

function binding(userId: string, messageId: string) {
  if (!userId || !messageId) throw new Error("Numo user message scope is required");
  return { scope: { kind: "user" as const, id: userId },
    table: "assistant_messages", column: "user_payload", rowId: messageId };
}

export async function shouldProtectNumoUserMessages(
  service: SupabaseClient,
): Promise<boolean> {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_NUMO_USER_MESSAGE_ENCRYPTION_ENABLED === "true") return true;
  const { data, error } = await service.from("numo_user_message_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve Numo user message encryption state");
  }
  return !!data;
}

export async function encodeNumoUserMessage(userId: string, messageId: string,
  value: UserMessagePayload) {
  if (value.content !== null && typeof value.content !== "string" ||
      value.context === undefined || value.metadata === undefined ||
      value.tool_call_id !== null && typeof value.tool_call_id !== "string" ||
      value.tool_name !== null && typeof value.tool_name !== "string") {
    throw new Error("Invalid Numo user message");
  }
  const store = getEncryptedStore();
  const content = await store.encrypt(value, binding(userId, messageId));
  return { id: messageId, content, context: null, metadata: {},
    tool_calls: null, tool_call_id: null, tool_name: null,
    user_payload_version: store.versionOf(content) };
}

export async function decodeNumoUserMessage<T extends {
  id: string; content: string | null; context?: unknown;
  metadata?: unknown; user_payload_version?: number;
  tool_calls?: unknown | null; tool_call_id?: string | null; tool_name?: string | null;
}>(userId: string, row: T, actorId: string | null = null): Promise<T> {
  const version = row.user_payload_version ?? 0;
  if (!version) return row;
  if (!Number.isSafeInteger(version) || version < 1 || !row.content ||
      row.context !== null || Object.keys(row.metadata ?? {}).length !== 0 ||
      row.tool_calls !== null && row.tool_calls !== undefined ||
      row.tool_call_id !== null && row.tool_call_id !== undefined ||
      row.tool_name !== null && row.tool_name !== undefined) {
    throw new Error("Invalid protected Numo user message");
  }
  const context = binding(userId, row.id);
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<UserMessagePayload>(row.content);
  if (store.versionOf(cipher) !== version || store.formatOf(cipher) !== 3) {
    throw new Error("Numo user message key version mismatch");
  }
  const decoded = await store.decrypt(cipher, context);
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded) ||
      decoded.content !== null && typeof decoded.content !== "string" ||
      !Object.hasOwn(decoded, "context") ||
      !Object.hasOwn(decoded, "metadata") ||
      decoded.tool_call_id !== null && typeof decoded.tool_call_id !== "string" ||
      decoded.tool_name !== null && typeof decoded.tool_name !== "string") {
    throw new Error("Invalid Numo user message payload");
  }
  auditDecryption(context, { actorId, reason: "repository_read" });
  return { ...row, content: decoded.content, context: decoded.context,
    metadata: decoded.metadata, tool_calls: decoded.tool_calls,
    tool_call_id: decoded.tool_call_id, tool_name: decoded.tool_name } as T;
}

export function numoUserMessageState(value: string) {
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(value);
  return { version: store.versionOf(cipher), format: store.formatOf(cipher) };
}

/** Refetch only rows already visible in the caller's history before decoding. */
export async function hydrateNumoUserMessages<T extends Record<string, unknown>>(
  client: SupabaseClient, rows: T[], actorId: string | null = null,
): Promise<T[]> {
  type StoredMessage = { id: string; content: string | null;
    context: unknown; metadata: unknown;
    tool_calls: unknown | null; tool_call_id: string | null; tool_name: string | null;
    user_payload_version: number;
    conversation: { user_id: string } | { user_id: string }[] };
  const ids = [...new Set(rows.filter((row) => row.source !== "agent" &&
    row.role === "user" && typeof row.id === "string" &&
    typeof row.content === "string" && row.content.startsWith('{"format":3,') &&
    !(row.metadata && typeof row.metadata === "object" &&
      (Object.hasOwn(row.metadata, "worker_input") ||
        Object.hasOwn(row.metadata, "worker_steering"))))
    .map((row) => row.id as string))];
  if (!ids.length) return rows;
  const stored = new Map<string, StoredMessage>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await client.from("assistant_messages")
      .select("id,content,context,metadata,tool_calls,tool_call_id,tool_name,user_payload_version,conversation:conversations!inner(user_id)")
      .in("id", ids.slice(offset, offset + 100));
    if (error && ["42703", "PGRST204", "PGRST205"].includes(error.code)) return rows;
    if (error) throw new Error("Unable to read protected Numo user messages");
    for (const row of data ?? []) stored.set(row.id, row as StoredMessage);
  }
  return Promise.all(rows.map(async (row) => {
    if (!ids.includes(row.id as string)) return row;
    const source = stored.get(row.id as string);
    if (!source || source.content !== row.content ||
        Object.hasOwn(row, "context") &&
          JSON.stringify(source.context) !== JSON.stringify(row.context) ||
        Object.hasOwn(row, "metadata") &&
          JSON.stringify(source.metadata) !== JSON.stringify(row.metadata) ||
        Object.hasOwn(row, "tool_calls") &&
          JSON.stringify(source.tool_calls) !== JSON.stringify(row.tool_calls) ||
        Object.hasOwn(row, "tool_call_id") &&
          source.tool_call_id !== row.tool_call_id ||
        Object.hasOwn(row, "tool_name") && source.tool_name !== row.tool_name) {
      throw new Error("Numo user message access changed");
    }
    const owner = Array.isArray(source.conversation)
      ? source.conversation[0]?.user_id : source.conversation?.user_id;
    if (!owner || actorId && owner !== actorId) {
      throw new Error("Numo user message owner changed");
    }
    const decoded = await decodeNumoUserMessage(owner, source, actorId);
    return { ...row, content: decoded.content, context: decoded.context,
      metadata: decoded.metadata, tool_calls: decoded.tool_calls,
      tool_call_id: decoded.tool_call_id, tool_name: decoded.tool_name } as T;
  }));
}
