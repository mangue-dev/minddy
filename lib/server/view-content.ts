import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { EncryptedRowCodec, type StoredRow } from
  "./encryption/row-codec";
import { getEncryptedStore } from "./encryption/registry";
import { isContentEncryptionEnabled } from "./encryption/content-config";

type Row = Record<string, unknown>;

function scope(row: Row) {
  if (typeof row.project_id === "string" && row.project_id) {
    return { kind: "project" as const, id: row.project_id };
  }
  if (typeof row.user_id === "string" && row.user_id) {
    return { kind: "user" as const, id: row.user_id };
  }
  throw new Error("View owner is required");
}

function valid(row: Row) {
  return typeof row.name === "string" && !!row.name.trim() &&
    typeof row.filters === "object" && row.filters !== null &&
    !Array.isArray(row.filters) &&
    typeof row.display === "object" && row.display !== null &&
    !Array.isArray(row.display);
}

export async function shouldProtectViews(service?: SupabaseClient): Promise<boolean> {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_VIEW_CONTENT_ENCRYPTION_ENABLED === "true") return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await (service ?? getServiceClient())
    .from("view_content_encryption_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code)) {
    throw new Error("Unable to resolve view content protection state");
  }
  return !!data;
}

/** The caller must authorize the project or personal owner first. */
export async function decodeView(row: Row, actorId: string | null = null):
  Promise<Row> {
  const { encryption_version: _version, encrypted_content: _cipher,
    content_revision: _revision, encryption_checked_at: _checked,
    ...plain } = row;
  if (row.encryption_version === undefined &&
      row.encrypted_content === undefined ||
      row.encryption_version === 0 && row.encrypted_content === null) {
    if (!valid(plain)) throw new Error("Invalid legacy view content");
    return plain;
  }
  const decoded = await new EncryptedRowCodec(getEncryptedStore()).decode(
    row as StoredRow, { table: "views", scope: scope(row) },
    { actorId, reason: "repository_read" });
  delete decoded.encryption_version;
  delete decoded.encrypted_content;
  delete decoded.content_revision;
  delete decoded.encryption_checked_at;
  if (!valid(decoded)) throw new Error("Invalid protected view content");
  return decoded;
}

/** Seal complete view content before an authorized insert, CAS edit or import. */
export async function encodeView(row: Row,
  options: { service?: SupabaseClient; force?: boolean } = {}): Promise<Row> {
  if (!valid(row) || typeof row.id !== "string" || !row.id) {
    throw new Error("Incomplete view content");
  }
  const protect = options.force || Number(row.encryption_version ?? 0) > 0 ||
    await shouldProtectViews(options.service);
  if (!protect) return row;
  return new EncryptedRowCodec(getEncryptedStore()).encode({
    ...row, encryption_version: 0, encrypted_content: null,
  } as StoredRow, { table: "views", scope: scope(row) });
}

export function viewContentValues(row: Row) {
  return { name: row.name, filters: row.filters, display: row.display,
    encrypted_content: row.encrypted_content ?? null,
    encryption_version: row.encryption_version ?? 0 };
}
