import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

export type OAuthClientContent = {
  client_name: string;
  redirect_uris: string[];
  logo_uri: string | null;
  client_uri: string | null;
};

export type StoredOAuthClient = {
  client_id: string;
  client_name: string | null;
  redirect_uris: string[] | null;
  logo_uri: string | null;
  client_uri: string | null;
  encrypted_content?: string | null;
  encryption_version?: number;
  content_revision?: number;
  created_at: string;
};

const scope = { kind: "system" as const,
  id: "00000000-0000-0000-0000-000000000000" };

function context(clientId: string) {
  return { scope, table: "oauth_clients", column: "content", rowId: clientId };
}

export async function shouldProtectOAuthClients(): Promise<boolean> {
  if (isContentEncryptionEnabled()) return true;
  const { data, error } = await getServiceClient()
    .from("oauth_client_content_scope").select("id").eq("id", true).maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code))
    throw new Error("Unable to resolve OAuth client protection state");
  return !!data;
}

export async function encodeOAuthClientContent(clientId: string,
  content: OAuthClientContent): Promise<{ encrypted_content: string;
    encryption_version: number }> {
  const store = getEncryptedStore();
  const ciphertext = await store.encrypt(content, context(clientId));
  return { encrypted_content: ciphertext as string,
    encryption_version: store.versionOf(ciphertext) };
}

export async function decodeOAuthClientContent(row: StoredOAuthClient):
  Promise<OAuthClientContent> {
  if (!row.encrypted_content) {
    if (!row.client_name || !Array.isArray(row.redirect_uris))
      throw new Error("Incomplete OAuth client content");
    return { client_name: row.client_name, redirect_uris: row.redirect_uris,
      logo_uri: row.logo_uri, client_uri: row.client_uri };
  }
  if (row.client_name !== null || row.redirect_uris !== null ||
      row.logo_uri !== null || row.client_uri !== null)
    throw new Error("OAuth client plaintext copy remains");
  const store = getEncryptedStore();
  const ciphertext = store.fromDatabase<OAuthClientContent>(row.encrypted_content);
  if (store.formatOf(ciphertext) !== 3 ||
      store.versionOf(ciphertext) !== row.encryption_version)
    throw new Error("Invalid OAuth client envelope");
  const content = await store.decrypt(ciphertext, context(row.client_id));
  if (!content || typeof content.client_name !== "string" ||
      !Array.isArray(content.redirect_uris) ||
      !content.redirect_uris.every((uri) => typeof uri === "string") ||
      (content.logo_uri !== null && typeof content.logo_uri !== "string") ||
      (content.client_uri !== null && typeof content.client_uri !== "string"))
    throw new Error("Invalid OAuth client content");
  return content;
}
