import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EncryptedRowCodec, type StoredRow } from "@/lib/server/encryption/row-codec";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { NUMO_MEMORY_LIMIT, normalizeNumoMemoryContent } from "@/lib/numo-memory";

/**
 * Numo's memory (MIN-915): the codec and the only repository of
 * `numo_memories`. Every call is bound to one user and filters on it, since
 * the table is service-only. The text is sealed under the user's key once
 * content encryption is enabled, like the notebook.
 */

export interface NumoMemory {
  id: string;
  /** Null: the memory applies everywhere. Otherwise only in that project. */
  project_id: string | null;
  content: string;
  source_conversation_id: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

type Row = Record<string, unknown>;

const COLUMNS = "id, user_id, project_id, content, encrypted_content, encryption_version, source_conversation_id, created_at, updated_at, last_used_at";

const context = (userId: string) => ({
  table: "numo_memories" as const,
  scope: { kind: "user" as const, id: userId },
});

/** Seal a complete row before it is written, when content encryption is on. */
export async function encodeNumoMemoryRow(row: Row, userId: string,
  options: { force?: boolean } = {}): Promise<Row> {
  if (row.user_id !== userId || typeof row.id !== "string" || !row.id ||
      typeof row.content !== "string") {
    throw new Error("Incomplete Numo memory");
  }
  if (!options.force && !isContentEncryptionEnabled()) {
    return { ...row, encryption_version: 0, encrypted_content: null };
  }
  return new EncryptedRowCodec(getEncryptedStore()).encode({
    ...row, encryption_version: 0, encrypted_content: null,
  } as StoredRow, context(userId));
}

export async function decodeNumoMemoryRow(row: Row, userId: string): Promise<NumoMemory> {
  if (row.user_id !== userId) throw new Error("Invalid Numo memory owner");
  let content: unknown;
  if (row.encryption_version === 0) {
    if (row.encrypted_content != null) throw new Error("Invalid clear Numo memory");
    content = row.content;
  } else {
    const decoded = await new EncryptedRowCodec(getEncryptedStore()).decode(
      row as StoredRow, context(userId), { actorId: userId, reason: "repository_read" });
    content = decoded.content;
  }
  if (typeof content !== "string") throw new Error("Invalid Numo memory content");
  return {
    id: row.id as string,
    project_id: (row.project_id as string | null) ?? null,
    content,
    source_conversation_id: (row.source_conversation_id as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    last_used_at: (row.last_used_at as string | null) ?? null,
  };
}

export class NumoMemoryError extends Error {
  constructor(
    readonly code: "invalid_content" | "limit_reached" | "not_found" | "database",
    message: string,
  ) {
    super(message);
  }
}

/**
 * Every memory of the user, most recently written first. A row that fails to
 * decode is left out (and logged) rather than breaking Numo's prompt; "Forget
 * everything" still removes it.
 */
export async function listNumoMemories(service: SupabaseClient,
  userId: string): Promise<NumoMemory[]> {
  const { data, error } = await service.from("numo_memories").select(COLUMNS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(NUMO_MEMORY_LIMIT * 2);
  if (error) throw new NumoMemoryError("database", "Unable to read Numo's memory");
  const memories: NumoMemory[] = [];
  for (const row of (data ?? []) as Row[]) {
    try {
      memories.push(await decodeNumoMemoryRow(row, userId));
    } catch {
      console.error("[numo-memory] decode_failed");
    }
  }
  return memories;
}

async function countNumoMemories(service: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await service.from("numo_memories")
    .select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (error) throw new NumoMemoryError("database", "Unable to read Numo's memory");
  return count ?? 0;
}

export async function createNumoMemory(service: SupabaseClient, userId: string, input: {
  content: unknown;
  projectId: string | null;
  sourceConversationId?: string | null;
}): Promise<NumoMemory> {
  const content = normalizeNumoMemoryContent(input.content);
  if (!content) throw new NumoMemoryError("invalid_content", "A memory is one non-empty statement of 1,000 characters at most.");
  if (await countNumoMemories(service, userId) >= NUMO_MEMORY_LIMIT) {
    throw new NumoMemoryError("limit_reached",
      `The user already keeps ${NUMO_MEMORY_LIMIT} memories, the maximum.`);
  }
  const now = new Date().toISOString();
  const row = await encodeNumoMemoryRow({
    id: randomUUID(), user_id: userId, project_id: input.projectId,
    content, source_conversation_id: input.sourceConversationId ?? null,
    created_at: now, updated_at: now,
  }, userId);
  const { data, error } = await service.from("numo_memories").insert(row)
    .select(COLUMNS).single();
  if (error || !data) throw new NumoMemoryError("database", "Unable to save the memory");
  return decodeNumoMemoryRow(data as Row, userId);
}

/** Rewrite a memory. `projectId` undefined keeps its current scope. */
export async function updateNumoMemory(service: SupabaseClient, userId: string,
  id: string, input: { content: unknown; projectId?: string | null }): Promise<NumoMemory> {
  const content = normalizeNumoMemoryContent(input.content);
  if (!content) throw new NumoMemoryError("invalid_content", "A memory is one non-empty statement of 1,000 characters at most.");
  const { data: current, error: readError } = await service.from("numo_memories")
    .select("id, project_id").eq("user_id", userId).eq("id", id).maybeSingle();
  if (readError) throw new NumoMemoryError("database", "Unable to read Numo's memory");
  if (!current) throw new NumoMemoryError("not_found", "No such memory.");
  const encoded = await encodeNumoMemoryRow({
    id, user_id: userId, content,
    project_id: input.projectId === undefined ? current.project_id : input.projectId,
  }, userId);
  const { data, error } = await service.from("numo_memories").update({
    project_id: encoded.project_id,
    content: encoded.content,
    encrypted_content: encoded.encrypted_content,
    encryption_version: encoded.encryption_version,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId).eq("id", id).select(COLUMNS).maybeSingle();
  if (error) throw new NumoMemoryError("database", "Unable to save the memory");
  if (!data) throw new NumoMemoryError("not_found", "No such memory.");
  return decodeNumoMemoryRow(data as Row, userId);
}

/** True when the memory existed and is gone. */
export async function deleteNumoMemory(service: SupabaseClient, userId: string,
  id: string): Promise<boolean> {
  const { data, error } = await service.from("numo_memories").delete()
    .eq("user_id", userId).eq("id", id).select("id");
  if (error) throw new NumoMemoryError("database", "Unable to delete the memory");
  return (data ?? []).length > 0;
}

export async function deleteAllNumoMemories(service: SupabaseClient,
  userId: string): Promise<number> {
  const { data, error } = await service.from("numo_memories").delete()
    .eq("user_id", userId).select("id");
  if (error) throw new NumoMemoryError("database", "Unable to delete the memories");
  return (data ?? []).length;
}

/** Record that these memories reached Numo's prompt. Best effort. */
export async function touchNumoMemories(service: SupabaseClient, userId: string,
  ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await service.from("numo_memories")
    .update({ last_used_at: new Date().toISOString() })
    .eq("user_id", userId).in("id", ids as string[]);
  if (error) console.error("[numo-memory] touch_failed", { code: error.code });
}
