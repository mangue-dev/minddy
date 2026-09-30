import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { EncryptedRowCodec, type StoredRow } from
  "@/lib/server/encryption/row-codec";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { isContentEncryptionEnabled } from
  "@/lib/server/encryption/content-config";
import { decryptForgeToken } from "@/lib/server/git/token-crypto";

const scope = { kind: "system" as const,
  id: "00000000-0000-0000-0000-000000000000" };

export type RelayInstanceContentRow = Record<string, unknown> & {
  id: string;
  name: string | null;
  webhook_url: string | null;
  webhook_secret_encrypted: string | null;
  encrypted_content?: string | null;
  encryption_version?: number;
  content_revision?: number;
};

function valid(row: RelayInstanceContentRow): boolean {
  return typeof row.id === "string" && typeof row.name === "string" &&
    (row.webhook_url == null || typeof row.webhook_url === "string") &&
    (row.webhook_secret_encrypted == null ||
      typeof row.webhook_secret_encrypted === "string");
}

export async function shouldProtectRelayInstance(service?: SupabaseClient):
  Promise<boolean> {
  if (isContentEncryptionEnabled()) return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await (service ?? getServiceClient())
    .from("forge_relay_instance_content_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code)) {
    throw new Error("Unable to resolve relay instance protection state");
  }
  return !!data;
}

/** Decode only after relay authentication or an operator permission check. */
export async function decodeRelayInstance(row: RelayInstanceContentRow):
  Promise<RelayInstanceContentRow> {
  if (row.encryption_version === undefined || row.encryption_version === 0) {
    if (row.encrypted_content != null) throw new Error("Invalid legacy relay state");
    const secret = row.webhook_secret_encrypted
      ? decryptForgeToken(row.webhook_secret_encrypted) : null;
    if (row.webhook_secret_encrypted && !secret) {
      throw new Error("Invalid legacy relay secret");
    }
    const plain = { ...row, webhook_url: row.webhook_url ?? null,
      webhook_secret_encrypted: secret };
    if (!valid(plain)) throw new Error("Invalid legacy relay content");
    return plain;
  }
  const decoded = await new EncryptedRowCodec(getEncryptedStore()).decode(
    row as StoredRow, { table: "forge_relay_instances", scope },
    { actorId: null, reason: "repository_read" }) as RelayInstanceContentRow;
  if (!valid(decoded)) throw new Error("Invalid protected relay content");
  delete decoded.encryption_checked_at;
  return decoded;
}

export async function encodeRelayInstance(row: RelayInstanceContentRow,
  options: { service?: SupabaseClient; force?: boolean } = {}):
  Promise<RelayInstanceContentRow> {
  if (!valid(row)) throw new Error("Incomplete relay instance content");
  const protect = options.force || Number(row.encryption_version ?? 0) > 0 ||
    await shouldProtectRelayInstance(options.service);
  if (!protect) return row;
  return new EncryptedRowCodec(getEncryptedStore()).encode({
    ...row, encrypted_content: null, encryption_version: 0,
  } as StoredRow, { table: "forge_relay_instances", scope }) as
    Promise<RelayInstanceContentRow>;
}
