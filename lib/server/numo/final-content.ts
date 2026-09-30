import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

const OUTCOME_PREFIX = "mdyf3";
const OUTCOME_ENCODED = /^mdyf3:([1-9][0-9]*):([A-Za-z0-9_-]+)$/;

export type FinalMessagePayload = {
  content: string | null;
  context: unknown;
  metadata: unknown;
  tool_call_id: string | null;
  tool_name: string | null;
};

function messageBinding(userId: string, messageId: string) {
  if (!userId || !messageId) throw new Error("Numo final message scope is required");
  return { scope: { kind: "user" as const, id: userId },
    table: "assistant_messages", column: "final_payload", rowId: messageId };
}

function outcomeBinding(userId: string, turnId: string) {
  if (!userId || !turnId) throw new Error("Numo turn outcome scope is required");
  return { scope: { kind: "user" as const, id: userId },
    table: "numo_assistant_turns", column: "outcome", rowId: turnId };
}

export async function shouldProtectNumoFinalContent(service: SupabaseClient):
  Promise<boolean> {
  if (isContentEncryptionEnabled()) {
    return true;
  }
  const { data, error } = await service.from("numo_final_content_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve Numo final content encryption state");
  }
  return !!data;
}

export async function encodeNumoFinalMessage(userId: string, messageId: string,
  value: FinalMessagePayload) {
  if (value.content !== null && typeof value.content !== "string" ||
      value.context === undefined || value.metadata === undefined ||
      value.tool_call_id !== null && typeof value.tool_call_id !== "string" ||
      value.tool_name !== null && typeof value.tool_name !== "string") {
    throw new Error("Invalid Numo final message");
  }
  const store = getEncryptedStore();
  const content = await store.encrypt(value, messageBinding(userId, messageId));
  return { id: messageId, content, context: null, metadata: {},
    tool_call_id: null, tool_name: null,
    final_payload_version: store.versionOf(content) };
}

export async function decodeNumoFinalMessage<T extends {
  id: string; content: string | null; context?: unknown; metadata?: unknown;
  tool_call_id?: string | null; tool_name?: string | null;
  final_payload_version?: number;
}>(userId: string, row: T, actorId: string | null = null): Promise<T> {
  const version = row.final_payload_version ?? 0;
  if (!version) return row;
  if (!Number.isSafeInteger(version) || version < 1 || !row.content ||
      row.context !== null || Object.keys(row.metadata ?? {}).length !== 0 ||
      row.tool_call_id !== null && row.tool_call_id !== undefined ||
      row.tool_name !== null && row.tool_name !== undefined) {
    throw new Error("Invalid protected Numo final message");
  }
  const context = messageBinding(userId, row.id);
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<FinalMessagePayload>(row.content);
  if (store.versionOf(cipher) !== version || store.formatOf(cipher) !== 3) {
    throw new Error("Numo final message key version mismatch");
  }
  const decoded = await store.decrypt(cipher, context);
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded) ||
      decoded.content !== null && typeof decoded.content !== "string" ||
      !Object.hasOwn(decoded, "context") || !Object.hasOwn(decoded, "metadata") ||
      decoded.tool_call_id !== null && typeof decoded.tool_call_id !== "string" ||
      decoded.tool_name !== null && typeof decoded.tool_name !== "string") {
    throw new Error("Invalid Numo final message payload");
  }
  auditDecryption(context, { actorId, reason: "repository_read" });
  return { ...row, content: decoded.content, context: decoded.context,
    metadata: decoded.metadata, tool_call_id: decoded.tool_call_id,
    tool_name: decoded.tool_name } as T;
}

export async function encodeNumoTurnOutcome(userId: string, turnId: string,
  value: string | null): Promise<string | null> {
  if (value === null) return null;
  if (typeof value !== "string" || value.startsWith(`${OUTCOME_PREFIX}:`)) {
    throw new Error("Invalid Numo turn outcome");
  }
  const store = getEncryptedStore();
  const cipher = await store.encrypt(value, outcomeBinding(userId, turnId));
  return `${OUTCOME_PREFIX}:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
}

export function isEncryptedNumoTurnOutcome(value: string | null): boolean {
  return typeof value === "string" && value.startsWith(`${OUTCOME_PREFIX}:`);
}

export async function decodeNumoTurnOutcome(userId: string, turnId: string,
  value: string | null, actorId: string | null = null): Promise<string | null> {
  if (!isEncryptedNumoTurnOutcome(value)) return value;
  const match = OUTCOME_ENCODED.exec(value!);
  if (!match) throw new Error("Invalid Numo turn outcome ciphertext");
  const serialized = Buffer.from(match[2], "base64url").toString("utf8");
  if (Buffer.from(serialized).toString("base64url") !== match[2]) {
    throw new Error("Invalid Numo turn outcome encoding");
  }
  const context = outcomeBinding(userId, turnId);
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<string>(serialized);
  if (store.versionOf(cipher) !== Number(match[1]) ||
      store.formatOf(cipher) !== 3) {
    throw new Error("Numo turn outcome key version mismatch");
  }
  const decoded = await store.decrypt(cipher, context);
  if (typeof decoded !== "string") throw new Error("Invalid Numo turn outcome");
  auditDecryption(context, { actorId, reason: "repository_read" });
  return decoded;
}

export function numoFinalMessageState(value: string) {
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(value);
  return { version: store.versionOf(cipher), format: store.formatOf(cipher) };
}

export function numoTurnOutcomeState(value: string) {
  const match = OUTCOME_ENCODED.exec(value);
  if (!match) throw new Error("Clear Numo turn outcome");
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(Buffer.from(match[2], "base64url").toString("utf8"));
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Numo turn outcome key version mismatch");
  }
  return { version: store.versionOf(cipher), format: store.formatOf(cipher) };
}

/** Refetch visible final messages to verify the view's source before decryption. */
export async function hydrateNumoFinalMessages<T extends Record<string, unknown>>(
  client: SupabaseClient, rows: T[], actorId: string | null = null,
): Promise<T[]> {
  type StoredMessage = { id: string; content: string | null;
    context: unknown; metadata: unknown; tool_call_id: string | null;
    tool_name: string | null; final_payload_version: number;
    conversation: { user_id: string } | { user_id: string }[] };
  const ids = [...new Set(rows.filter((row) => row.source !== "agent" &&
    row.role === "assistant" && row.tool_calls == null &&
    typeof row.id === "string" && typeof row.content === "string" &&
    row.content.startsWith('{"format":3,'))
    .map((row) => row.id as string))];
  if (!ids.length) return rows;
  const stored = new Map<string, StoredMessage>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await client.from("assistant_messages")
      .select("id,content,context,metadata,tool_call_id,tool_name,final_payload_version,conversation:conversations!inner(user_id)")
      .in("id", ids.slice(offset, offset + 100));
    if (error && ["42703", "PGRST204", "PGRST205"].includes(error.code)) return rows;
    if (error) throw new Error("Unable to read protected Numo final messages");
    for (const row of data ?? []) stored.set(row.id, row as StoredMessage);
  }
  return Promise.all(rows.map(async (row) => {
    if (!ids.includes(row.id as string)) return row;
    const source = stored.get(row.id as string);
    if (!source || source.content !== row.content ||
        Object.hasOwn(row, "context") &&
          JSON.stringify(source.context) !== JSON.stringify(row.context) ||
        Object.hasOwn(row, "metadata") &&
          JSON.stringify(source.metadata) !== JSON.stringify(row.metadata)) {
      throw new Error("Numo final message access changed");
    }
    const owner = Array.isArray(source.conversation)
      ? source.conversation[0]?.user_id : source.conversation?.user_id;
    if (!owner || actorId && owner !== actorId) {
      throw new Error("Numo final message owner changed");
    }
    const decoded = await decodeNumoFinalMessage(owner, source, actorId);
    return { ...row, content: decoded.content, context: decoded.context,
      metadata: decoded.metadata, tool_call_id: decoded.tool_call_id,
      tool_name: decoded.tool_name } as T;
  }));
}
