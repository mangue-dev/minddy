import "server-only";

import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { getServiceClient } from "@/lib/supabase-service";
import type { SupabaseClient } from "@supabase/supabase-js";

const PREFIX = "mdya3";
const ENCODED = /^mdya3:([1-9][0-9]*):([A-Za-z0-9_-]+)$/;
export type AttachmentTable = "attachments" | "page_files";
export type AttachmentColumn = "file_name" | "url" | "icon_data_url";

function binding(table: AttachmentTable, projectId: string, id: string,
  column: AttachmentColumn) {
  if (!projectId || !id || table === "page_files" && column !== "file_name") {
    throw new Error("Invalid attachment content binding");
  }
  return { scope: { kind: "project" as const, id: projectId }, table,
    column, rowId: id };
}

export function isEncryptedAttachmentValue(value: string | null): boolean {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

export async function shouldEncryptAttachmentMetadata(
  service: SupabaseClient = getServiceClient()): Promise<boolean> {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_ATTACHMENT_METADATA_ENCRYPTION_ENABLED === "true") return true;
  const { data, error } = await service
    .from("attachment_metadata_encryption_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve attachment metadata encryption state");
  }
  return !!data;
}

export async function encodeAttachmentValue(table: AttachmentTable,
  projectId: string, id: string, column: AttachmentColumn,
  value: string): Promise<string> {
  if (isEncryptedAttachmentValue(value)) throw new Error("Invalid attachment value");
  const store = getEncryptedStore();
  const cipher = await store.encrypt(value, binding(table, projectId, id, column));
  return `${PREFIX}:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
}

export async function decodeAttachmentValue(table: AttachmentTable,
  projectId: string, id: string, column: AttachmentColumn,
  value: string | null, actorId: string | null = null): Promise<string | null> {
  if (!isEncryptedAttachmentValue(value)) return value;
  const match = ENCODED.exec(value!);
  if (!match) throw new Error("Invalid encrypted attachment value");
  const serialized = Buffer.from(match[2], "base64url").toString("utf8");
  if (Buffer.from(serialized).toString("base64url") !== match[2]) {
    throw new Error("Invalid attachment ciphertext encoding");
  }
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<string>(serialized);
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Attachment key version mismatch");
  }
  const context = binding(table, projectId, id, column);
  const plain = await store.decrypt(cipher, context);
  if (typeof plain !== "string") throw new Error("Invalid attachment content");
  auditDecryption(context, { actorId, reason: "repository_read" });
  return plain;
}

export function attachmentValueState(value: string) {
  const match = ENCODED.exec(value);
  if (!match) throw new Error("Invalid encrypted attachment value");
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(Buffer.from(match[2], "base64url").toString("utf8"));
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Attachment key version mismatch");
  }
  return { version: store.versionOf(cipher), format: store.formatOf(cipher) };
}

export async function decodeAttachmentRow<T extends Record<string, unknown>>(
  table: AttachmentTable, row: T, actorId: string | null = null,
  projectId: string | null = null): Promise<T> {
  const owner = typeof row.project_id === "string" ? row.project_id : projectId;
  if (projectId && typeof row.project_id === "string" && row.project_id !== projectId) {
    throw new Error("Attachment project scope mismatch");
  }
  if (typeof row.id !== "string" || typeof owner !== "string") {
    throw new Error("Attachment row identity is required");
  }
  const next: Record<string, unknown> = { ...row };
  const columns: AttachmentColumn[] = table === "attachments"
    ? ["file_name", "url", "icon_data_url"] : ["file_name"];
  for (const column of columns) {
    if (typeof row[column] === "string") {
      next[column] = await decodeAttachmentValue(table, owner,
        row.id, column, row[column] as string, actorId);
    }
  }
  delete next.content_encryption_checked_at;
  return next as T;
}
