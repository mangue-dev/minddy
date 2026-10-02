import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { EncryptedRowCodec, type StoredRow } from "./encryption/row-codec";
import { getEncryptedStore } from "./encryption/registry";
import { isContentEncryptionEnabled } from "./encryption/content-config";
import { decryptUserAiKey,
  LOCAL_ENDPOINT_WITHOUT_API_KEY } from "./agent/byok-credentials";

export type UserAiKeyRow = Record<string, unknown> & {
  id: string; user_id: string; provider: string;
  key_encrypted: string | null; base_url: string | null;
  feature_models: Record<string, unknown> | null;
  encrypted_content?: string | null; encryption_version?: number;
  content_revision?: number;
};

function valid(row: UserAiKeyRow): boolean {
  return typeof row.id === "string" && typeof row.user_id === "string" &&
    typeof row.provider === "string" &&
    typeof row.key_encrypted === "string" &&
    (row.base_url === null || typeof row.base_url === "string") &&
    row.feature_models !== null && typeof row.feature_models === "object" &&
    !Array.isArray(row.feature_models);
}

export async function shouldProtectUserAiKeys(service?: SupabaseClient):
  Promise<boolean> {
  if (isContentEncryptionEnabled()) return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await (service ?? getServiceClient())
    .from("user_ai_key_content_scope").select("id").eq("id", true)
    .maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code)) {
    throw new Error("Unable to resolve BYOK protection state");
  }
  return !!data;
}

/** The caller must establish ownership before decoding a saved credential. */
export async function decodeUserAiKeyRow(row: UserAiKeyRow,
  actorId: string | null = null): Promise<UserAiKeyRow> {
  if (row.encryption_version === undefined || row.encryption_version === 0) {
    if (row.encrypted_content != null) throw new Error("Invalid legacy BYOK state");
    const key = row.key_encrypted === LOCAL_ENDPOINT_WITHOUT_API_KEY
      ? row.key_encrypted : decryptUserAiKey(row.key_encrypted);
    if (key === null) throw new Error("Unable to decode legacy BYOK credential");
    const plain = { ...row, key_encrypted: key,
      feature_models: row.feature_models ?? {} };
    if (!valid(plain)) throw new Error("Invalid legacy BYOK content");
    return plain;
  }
  const decoded = await new EncryptedRowCodec(getEncryptedStore()).decode(
    row as StoredRow, { table: "user_ai_keys",
      scope: { kind: "user", id: row.user_id } },
    { actorId, reason: "repository_read" }) as UserAiKeyRow;
  if (!valid(decoded)) throw new Error("Invalid protected BYOK content");
  delete decoded.encryption_checked_at;
  return decoded;
}

export async function encodeUserAiKeyRow(row: UserAiKeyRow,
  options: { service?: SupabaseClient; force?: boolean } = {}):
  Promise<UserAiKeyRow> {
  if (!valid(row)) throw new Error("Incomplete BYOK credential");
  const protect = options.force || Number(row.encryption_version ?? 0) > 0 ||
    await shouldProtectUserAiKeys(options.service);
  if (!protect) return row;
  return new EncryptedRowCodec(getEncryptedStore()).encode({
    ...row, encrypted_content: null, encryption_version: 0,
  } as StoredRow, { table: "user_ai_keys",
    scope: { kind: "user", id: row.user_id } }) as Promise<UserAiKeyRow>;
}
