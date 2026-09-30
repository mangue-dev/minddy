import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

export type ToolMessagePayload = {
  role: "assistant" | "tool";
  content: string | null;
  tool_calls: unknown | null;
  context: unknown;
  metadata: unknown;
};
type StoredToolMessage = ToolMessagePayload & {
  id: string; tool_payload_version?: number;
  tool_call_id?: string | null; tool_name?: string | null;
};
export type ProtectedCheckpoint = { phase: "model" | "tools";
  encrypted_payload: string; encryption_version: number };

function messageBinding(userId: string, messageId: string) {
  if (!userId || !messageId) throw new Error("Numo tool message scope is required");
  return { scope: { kind: "user" as const, id: userId },
    table: "assistant_messages", column: "tool_payload", rowId: messageId };
}

function checkpointBinding(userId: string, turnId: string) {
  if (!userId || !turnId) throw new Error("Numo checkpoint scope is required");
  return { scope: { kind: "user" as const, id: userId },
    table: "numo_assistant_turns", column: "checkpoint", rowId: turnId };
}

export async function shouldProtectNumoToolContent(service: SupabaseClient) {
  if (isContentEncryptionEnabled()) return true;
  const { data, error } = await service.from("numo_tool_content_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code)) {
    throw new Error("Unable to resolve Numo tool content protection state");
  }
  return !!data;
}

export async function encodeNumoToolMessage(userId: string, messageId: string,
  payload: ToolMessagePayload) {
  if (!payload || !["assistant", "tool"].includes(payload.role) ||
      payload.content !== null && typeof payload.content !== "string" ||
      payload.role === "assistant" &&
        (!Array.isArray(payload.tool_calls) || !payload.tool_calls.length) ||
      payload.role === "tool" && payload.tool_calls !== null ||
      payload.context === undefined || payload.metadata === undefined) {
    throw new Error("Invalid Numo tool message");
  }
  const store = getEncryptedStore();
  const content = await store.encrypt(payload, messageBinding(userId, messageId));
  return { id: messageId, content, tool_calls: null, context: null,
    metadata: {}, tool_payload_version: store.versionOf(content) };
}

export async function decodeNumoToolMessage<T extends StoredToolMessage>(
  userId: string, row: T, actorId: string | null = null): Promise<T> {
  const version = row.tool_payload_version ?? 0;
  if (!version) return row;
  if (!row.content || row.tool_calls !== null || row.context !== null ||
      Object.keys(row.metadata ?? {}).length !== 0) {
    throw new Error("Invalid protected Numo tool message");
  }
  const context = messageBinding(userId, row.id);
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<ToolMessagePayload>(row.content);
  if (store.versionOf(cipher) !== version || store.formatOf(cipher) !== 3) {
    throw new Error("Numo tool message key version mismatch");
  }
  const decoded = await store.decrypt(cipher, context);
  if (!decoded || decoded.role !== row.role ||
      decoded.content !== null && typeof decoded.content !== "string" ||
      decoded.role === "assistant" &&
        (!Array.isArray(decoded.tool_calls) || !decoded.tool_calls.length) ||
      decoded.role === "tool" && decoded.tool_calls !== null ||
      !Object.hasOwn(decoded, "context") ||
      !Object.hasOwn(decoded, "metadata")) {
    throw new Error("Invalid Numo tool message payload");
  }
  auditDecryption(context, { actorId, reason: "repository_read" });
  return { ...row, ...decoded };
}

export function numoToolMessageState(value: string) {
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(value);
  return { version: store.versionOf(cipher), format: store.formatOf(cipher) };
}

export async function encodeNumoCheckpoint(userId: string, turnId: string,
  value: Record<string, unknown>): Promise<ProtectedCheckpoint | Record<string, unknown>> {
  if (value.phase !== "model" && value.phase !== "tools") return value;
  if (Object.hasOwn(value, "encrypted_payload")) {
    throw new Error("Invalid Numo checkpoint");
  }
  const store = getEncryptedStore();
  const cipher = await store.encrypt(value, checkpointBinding(userId, turnId));
  return { phase: value.phase, encrypted_payload: cipher,
    encryption_version: store.versionOf(cipher) };
}

export async function decodeNumoCheckpoint(userId: string, turnId: string,
  value: Record<string, unknown>, actorId: string | null = null):
  Promise<Record<string, unknown>> {
  if (!Object.hasOwn(value, "encrypted_payload")) return value;
  if ((value.phase !== "model" && value.phase !== "tools") ||
      Object.keys(value).length !== 3 ||
      typeof value.encrypted_payload !== "string" ||
      !Number.isSafeInteger(value.encryption_version) ||
      Number(value.encryption_version) < 1) {
    throw new Error("Invalid protected Numo checkpoint");
  }
  const context = checkpointBinding(userId, turnId);
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<Record<string, unknown>>(
    value.encrypted_payload);
  if (store.versionOf(cipher) !== value.encryption_version ||
      store.formatOf(cipher) !== 3) {
    throw new Error("Numo checkpoint key version mismatch");
  }
  const decoded = await store.decrypt(cipher, context);
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded) ||
      decoded.phase !== value.phase || Object.hasOwn(decoded, "encrypted_payload")) {
    throw new Error("Invalid Numo checkpoint payload");
  }
  auditDecryption(context, { actorId, reason: "repository_read" });
  return decoded;
}

/** Refetch the invoker-visible source before decoding Numo tool projections. */
export async function hydrateNumoToolMessages<T extends Record<string, unknown>>(
  client: SupabaseClient, rows: T[], actorId: string | null = null,
): Promise<T[]> {
  type Source = StoredToolMessage & { conversation:
    { user_id: string } | { user_id: string }[] };
  const ids = [...new Set(rows.filter((row) => row.source !== "agent" &&
    (row.role === "assistant" || row.role === "tool") &&
    typeof row.id === "string" && typeof row.content === "string" &&
    row.content.startsWith('{"format":3,'))
    .map((row) => row.id as string))];
  if (!ids.length) return rows;
  const stored = new Map<string, Source>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await client.from("assistant_messages")
      .select("id,role,content,tool_calls,context,metadata,tool_call_id,tool_name,tool_payload_version,conversation:conversations!inner(user_id)")
      .in("id", ids.slice(offset, offset + 100));
    if (error && ["42703", "PGRST204", "PGRST205"].includes(error.code)) return rows;
    if (error) throw new Error("Unable to read protected Numo tool messages");
    for (const row of data ?? []) stored.set(row.id, row as Source);
  }
  return Promise.all(rows.map(async (row) => {
    const source = stored.get(row.id as string);
    if (!source?.tool_payload_version) return row;
    if (source.content !== row.content || source.role !== row.role ||
        Object.hasOwn(row, "tool_calls") &&
          JSON.stringify(source.tool_calls) !== JSON.stringify(row.tool_calls) ||
        Object.hasOwn(row, "metadata") &&
          JSON.stringify(source.metadata) !== JSON.stringify(row.metadata) ||
        Object.hasOwn(row, "context") &&
          JSON.stringify(source.context) !== JSON.stringify(row.context)) {
      throw new Error("Numo tool message access changed");
    }
    const owner = Array.isArray(source.conversation)
      ? source.conversation[0]?.user_id : source.conversation?.user_id;
    if (!owner || actorId && owner !== actorId) {
      throw new Error("Numo tool message owner changed");
    }
    const decoded = await decodeNumoToolMessage(owner, source, actorId);
    return { ...row, content: decoded.content, tool_calls: decoded.tool_calls,
      context: decoded.context, metadata: decoded.metadata } as T;
  }));
}
