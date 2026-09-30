import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { EncryptedRowCodec, type StoredRow } from
  "./encryption/row-codec";
import { isContentEncryptionEnabled } from "./encryption/content-config";
import { getBlindIndexKeys, getEncryptedStore } from
  "./encryption/registry";
import { blindIndex } from "./encryption/store";
import { isSavedViewHref } from "@/lib/saved-view-href";

type Row = Record<string, unknown>;

function valid(row: Row) {
  return typeof row.id === "string" && !!row.id &&
    typeof row.user_id === "string" && !!row.user_id &&
    typeof row.name === "string" && !!row.name.trim() &&
    isSavedViewHref(row.href);
}

export async function shouldProtectSavedViews(service?: SupabaseClient):
  Promise<boolean> {
  if (isContentEncryptionEnabled()) return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await (service ?? getServiceClient())
    .from("saved_view_bookmark_encryption_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code)) {
    throw new Error("Unable to resolve saved-view protection state");
  }
  return !!data;
}

/** The authenticated query must establish user ownership before this call. */
export async function decodeSavedView(row: Row, actorId: string): Promise<Row> {
  if (row.user_id !== actorId) throw new Error("Saved view owner mismatch");
  const { name_index: _index, encrypted_content: _cipher,
    encryption_version: _version, content_revision: _revision,
    encryption_checked_at: _checked, ...plain } = row;
  if (row.encryption_version === undefined &&
      row.encrypted_content === undefined ||
      row.encryption_version === 0 && row.encrypted_content === null) {
    if (!valid(plain)) throw new Error("Invalid legacy saved view");
    return plain;
  }
  const decoded = await new EncryptedRowCodec(getEncryptedStore()).decode(
    row as StoredRow, { table: "saved_views",
      scope: { kind: "user", id: actorId } },
    { actorId, reason: "repository_read" });
  delete decoded.name_index;
  delete decoded.content_revision;
  delete decoded.encryption_checked_at;
  if (!valid(decoded)) throw new Error("Invalid protected saved view");
  const expected = await savedViewNameIndex(actorId, decoded.name as string);
  if (row.name_index !== expected) throw new Error("Saved view name index mismatch");
  return decoded;
}

/** Version one is retained so content-key rotation cannot change equality. */
export async function savedViewNameIndex(userId: string, name: string) {
  const scope = { kind: "user" as const, id: userId };
  const initial = await getBlindIndexKeys().current(scope);
  initial.bytes.fill(0);
  const key = await getBlindIndexKeys().byVersion(scope, 1);
  try {
    return blindIndex(name, { scope, table: "saved_views", column: "name" },
      key.bytes);
  } finally { key.bytes.fill(0); }
}

export async function encodeSavedView(row: Row,
  options: { service?: SupabaseClient; force?: boolean } = {}): Promise<Row> {
  if (!valid(row)) throw new Error("Incomplete saved view");
  const protect = options.force || Number(row.encryption_version ?? 0) > 0 ||
    await shouldProtectSavedViews(options.service);
  if (!protect) return row;
  const scope = { kind: "user" as const, id: row.user_id as string };
  const nameIndex = await savedViewNameIndex(scope.id, row.name as string);
  return { ...await new EncryptedRowCodec(getEncryptedStore()).encode({
    ...row, encrypted_content: null, encryption_version: 0,
  } as StoredRow, { table: "saved_views", scope }), name_index: nameIndex };
}

export function savedViewValues(row: Row) {
  return { name: row.name, href: row.href,
    name_index: row.name_index ?? null,
    encrypted_content: row.encrypted_content ?? null,
    encryption_version: row.encryption_version ?? 0 };
}
