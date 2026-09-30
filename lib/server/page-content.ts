import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { EncryptedRowCodec, type StoredRow } from "./encryption/row-codec";
import { getEncryptedStore } from "./encryption/registry";
import { isContentEncryptionEnabled } from "./encryption/content-config";
import { auditDecryption } from "./encryption/audit";
import type { Page } from "@/lib/pages";

type Row = Record<string, unknown>;
const CONTENT = ["title", "icon", "content", "database_schema",
  "database_title_name", "property_values"] as const;

function scope(row: Row) {
  if (typeof row.project_id !== "string" || typeof row.id !== "string") {
    throw new Error("Page scope and identity are required");
  }
  return { kind: "project" as const, id: row.project_id };
}

function complete(row: Row) {
  return typeof row.title === "string" &&
    (row.icon === null || typeof row.icon === "string") &&
    (row.database_schema === null || Array.isArray(row.database_schema)) &&
    (row.database_title_name === null || typeof row.database_title_name === "string") &&
    !!row.content && typeof row.content === "object" &&
    !!row.property_values && typeof row.property_values === "object" &&
    !Array.isArray(row.property_values);
}

function blank(row: Row): boolean {
  const body = row.content as { content?: unknown } | null;
  const blocks = Array.isArray(body?.content) ? body.content : [];
  const bodyBlank = blocks.length === 0 || blocks.length === 1 &&
    (blocks[0] as { type?: string; content?: unknown })?.type === "paragraph" &&
    (!Array.isArray((blocks[0] as { content?: unknown }).content) ||
      ((blocks[0] as { content: unknown[] }).content).length === 0);
  return row.database_schema === null &&
    Object.keys(row.property_values as object).length === 0 &&
    (row.title as string).trim() === "" && row.icon === null && bodyBlank;
}

export async function shouldProtectPages(service?: SupabaseClient): Promise<boolean> {
  if (isContentEncryptionEnabled()) return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await (service ?? getServiceClient())
    .from("page_content_encryption_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code)) {
    throw new Error("Unable to resolve page content protection state");
  }
  return !!data;
}

/** The caller must establish project membership or a public page capability. */
export async function decodePageProjection<T extends Row>(row: T,
  actorId: string | null = null): Promise<T> {
  if (row.encryption_version === undefined || row.encryption_version === 0) {
    if (row.encrypted_content != null) throw new Error("Invalid legacy page state");
    return row;
  }
  if (!Number.isSafeInteger(row.encryption_version) ||
      Number(row.encryption_version) < 1 ||
      typeof row.encrypted_content !== "string") {
    throw new Error("Invalid protected page state");
  }
  for (const field of CONTENT) {
    if (Object.hasOwn(row, field) && row[field] !== null) {
      throw new Error("Protected page retains plaintext");
    }
  }
  if (Object.hasOwn(row, "search_text") && row.search_text !== null) {
    throw new Error("Protected page retains a search projection");
  }
  const store = getEncryptedStore();
  const context = { table: "pages", scope: scope(row),
    column: "encrypted_content", rowId: JSON.stringify([row.id]) };
  const envelope = store.fromDatabase<Row>(row.encrypted_content);
  if (store.versionOf(envelope) !== row.encryption_version) {
    throw new Error("Page key version mismatch");
  }
  const plain = await store.decrypt(envelope, context);
  if (!plain || typeof plain !== "object" || Array.isArray(plain) ||
      !CONTENT.every((field) => Object.hasOwn(plain, field)) ||
      !complete(plain)) throw new Error("Invalid protected page content");
  auditDecryption(context, { actorId, reason: "repository_read" });
  const { encrypted_content: _cipher, encryption_version: _version,
    content_revision: _revision, encryption_checked_at: _checked,
    ...visible } = row;
  return { ...visible, ...plain } as T;
}

export async function decodePage(row: Row, actorId: string | null = null):
  Promise<Page> {
  if (row.encryption_version === undefined || row.encryption_version === 0) {
    if (!complete(row)) throw new Error("Incomplete legacy page content");
    return row as unknown as Page;
  }
  const decoded = await new EncryptedRowCodec(getEncryptedStore()).decode(
    row as StoredRow, { table: "pages", scope: scope(row) },
    { actorId, reason: "repository_read" });
  if (!complete(decoded) ||
      decoded.page_is_database !== (decoded.database_schema !== null) ||
      decoded.page_has_values !==
        (Object.keys(decoded.property_values as object).length > 0) ||
      decoded.page_is_blank !== blank(decoded)) {
    throw new Error("Page content metadata mismatch");
  }
  decoded.encryption_version = row.encryption_version;
  delete decoded.encryption_checked_at;
  return decoded as unknown as Page;
}

export async function encodePage(row: Row,
  options: { service?: SupabaseClient; force?: boolean } = {}): Promise<Row> {
  if (!complete(row)) throw new Error("Incomplete page content");
  const protect = options.force || Number(row.encryption_version ?? 0) > 0 ||
    await shouldProtectPages(options.service);
  if (!protect) return row;
  const prepared = { ...row, page_is_database: row.database_schema !== null,
    page_has_values: Object.keys(row.property_values as object).length > 0,
    page_is_blank: blank(row), encrypted_content: null,
    encryption_version: 0 };
  return new EncryptedRowCodec(getEncryptedStore()).encode(
    prepared as StoredRow, { table: "pages", scope: scope(row) });
}

export function pageContentValues(row: Row): Row {
  return Object.fromEntries([...CONTENT, "search_text", "encrypted_content",
    "encryption_version", "page_is_database", "page_has_values",
    "page_is_blank"].filter((key) => Object.hasOwn(row, key))
    .map((key) => [key, row[key]]));
}
