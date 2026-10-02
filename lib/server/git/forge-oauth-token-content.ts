import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { decryptForgeToken, encryptForgeToken } from "./token-crypto";

export type ForgeOAuthTable = "git_connections" | "git_user_identities";
export type ForgeOAuthTokens = { accessToken: string;
  refreshToken: string | null };
export type DecodedForgeOAuthTokens = { accessToken: string | null;
  refreshToken: string | null };
export type ForgeOAuthTokenRow = {
  id?: string;
  user_id: string;
  provider: string;
  provider_account_id?: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  encrypted_content?: string | null;
  encryption_version?: number;
};

function context(table: ForgeOAuthTable,row: ForgeOAuthTokenRow) {
  if (!row.user_id || !row.provider) {
    throw new Error("Incomplete forge OAuth token identity");
  }
  return { scope: { kind: "user" as const, id: row.user_id }, table,
    column: "encrypted_content",
    rowId: JSON.stringify(table === "git_connections"
      ? [row.user_id,row.provider,row.provider_account_id ?? null]
      : [row.user_id,row.provider]) };
}

export async function shouldProtectForgeOAuthTokens(service?: SupabaseClient):
  Promise<boolean> {
  if (isContentEncryptionEnabled()) {
    return true;
  }
  const { data, error } = await (service ?? getServiceClient())
    .from("forge_oauth_token_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && !["42P01","PGRST205"].includes(error.code)) {
    throw new Error("Unable to resolve forge OAuth protection state");
  }
  if (!process.env.MINDDY_DATA_ROOT_KEY && !data) return false;
  return !!data;
}

export async function encodeForgeOAuthTokens(table: ForgeOAuthTable,
  row: Pick<ForgeOAuthTokenRow,"user_id"|"provider"|
    "provider_account_id">, tokens: ForgeOAuthTokens,
  options: { service?: SupabaseClient; force?: boolean } = {}) {
  if (!tokens.accessToken ||
      (tokens.refreshToken !== null && !tokens.refreshToken)) {
    throw new Error("Invalid forge OAuth token set");
  }
  if (!options.force && !await shouldProtectForgeOAuthTokens(options.service)) {
    return { access_token_encrypted: encryptForgeToken(tokens.accessToken),
      refresh_token_encrypted: tokens.refreshToken
        ? encryptForgeToken(tokens.refreshToken) : null,
      encrypted_content: null, encryption_version: 0 };
  }
  const store = getEncryptedStore();
  const ciphertext = await store.encrypt(tokens,
    context(table,{ ...row, access_token_encrypted: null,
      refresh_token_encrypted: null }));
  return { access_token_encrypted: null, refresh_token_encrypted: null,
    encrypted_content: ciphertext,
    encryption_version: store.versionOf(ciphertext) };
}

export async function decodeForgeOAuthTokens(table: ForgeOAuthTable,
  row: ForgeOAuthTokenRow): Promise<DecodedForgeOAuthTokens> {
  if (row.encryption_version) {
    if (!row.encrypted_content || row.access_token_encrypted !== null ||
        row.refresh_token_encrypted !== null) {
      throw new Error("Invalid protected forge OAuth token row");
    }
    const store = getEncryptedStore();
    const cipher = store.fromDatabase<ForgeOAuthTokens>(row.encrypted_content);
    if (store.formatOf(cipher) !== 3 ||
        store.versionOf(cipher) !== row.encryption_version) {
      throw new Error("Forge OAuth token version mismatch");
    }
    const tokens = await store.decrypt(cipher,context(table,row));
    if (!tokens || typeof tokens.accessToken !== "string" ||
        !tokens.accessToken ||
        (tokens.refreshToken !== null &&
          typeof tokens.refreshToken !== "string")) {
      throw new Error("Invalid forge OAuth token content");
    }
    return tokens;
  }
  if (row.encrypted_content || !row.access_token_encrypted) {
    throw new Error("Invalid legacy forge OAuth token row");
  }
  const tokens = { accessToken: decryptForgeToken(row.access_token_encrypted),
    refreshToken: row.refresh_token_encrypted
      ? decryptForgeToken(row.refresh_token_encrypted) : null };
  return { accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken };
}
