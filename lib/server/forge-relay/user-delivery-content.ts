import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { decryptForgeToken, encryptForgeToken } from
  "@/lib/server/git/token-crypto";

const scope = { kind: "system" as const,
  id: "00000000-0000-0000-0000-000000000000" };

function context(deliveryId: string, instanceId: string) {
  if (!deliveryId || !instanceId) throw new Error("Relay delivery identity is required");
  return { scope, table: "forge_relay_user_deliveries",
    column: "encrypted_content", rowId: JSON.stringify([deliveryId,instanceId]) };
}

export type DeliveryTokens = { accessToken: string; refreshToken: string | null };
export type DeliveryTokenRow = { id: string; instance_id: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  encrypted_content?: string | null;
  encryption_version?: number };

export async function shouldProtectUserDelivery(service?: SupabaseClient):
  Promise<boolean> {
  if (isContentEncryptionEnabled()) {
    return true;
  }
  const { data, error } = await (service ?? getServiceClient())
    .from("forge_relay_user_delivery_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && !["42P01","PGRST205"].includes(error.code)) {
    throw new Error("Unable to resolve relay user delivery protection state");
  }
  if (!process.env.MINDDY_DATA_ROOT_KEY && !data) return false;
  return !!data;
}

export async function encodeDeliveryTokens(deliveryId: string,
  instanceId: string, tokens: DeliveryTokens,
  options: { service?: SupabaseClient; force?: boolean } = {}):
  Promise<Pick<DeliveryTokenRow,"access_token_encrypted"|
    "refresh_token_encrypted"|"encrypted_content"|"encryption_version">> {
  if (!tokens.accessToken ||
      (tokens.refreshToken !== null && !tokens.refreshToken)) {
    throw new Error("Invalid relay user delivery token set");
  }
  if (!options.force && !await shouldProtectUserDelivery(options.service)) {
    return { access_token_encrypted: encryptForgeToken(tokens.accessToken),
      refresh_token_encrypted: tokens.refreshToken
        ? encryptForgeToken(tokens.refreshToken) : null };
  }
  const store = getEncryptedStore();
  const ciphertext = await store.encrypt(tokens,context(deliveryId,instanceId));
  return { access_token_encrypted: null, refresh_token_encrypted: null,
    encrypted_content: ciphertext,
    encryption_version: store.versionOf(ciphertext) };
}

export async function decodeDeliveryTokens(row: DeliveryTokenRow):
  Promise<DeliveryTokens> {
  if (row.encryption_version) {
    if (!row.encrypted_content || row.access_token_encrypted !== null ||
        row.refresh_token_encrypted !== null) {
      throw new Error("Invalid protected relay user delivery");
    }
    const store = getEncryptedStore();
    const ciphertext = store.fromDatabase<DeliveryTokens>(row.encrypted_content);
    if (store.formatOf(ciphertext) !== 3 ||
        store.versionOf(ciphertext) !== row.encryption_version) {
      throw new Error("Relay user delivery key version mismatch");
    }
    const tokens = await store.decrypt(ciphertext,
      context(row.id,row.instance_id));
    if (!tokens || typeof tokens.accessToken !== "string" ||
        !tokens.accessToken ||
        (tokens.refreshToken !== null &&
          typeof tokens.refreshToken !== "string")) {
      throw new Error("Invalid protected relay user delivery tokens");
    }
    return tokens;
  }
  if (row.encrypted_content || !row.access_token_encrypted) {
    throw new Error("Invalid legacy relay user delivery");
  }
  const tokens = { accessToken: decryptForgeToken(row.access_token_encrypted),
    refreshToken: row.refresh_token_encrypted
      ? decryptForgeToken(row.refresh_token_encrypted) : null };
  if (!tokens.accessToken ||
      (row.refresh_token_encrypted && !tokens.refreshToken)) {
    throw new Error("Unreadable legacy relay user delivery");
  }
  return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
}
