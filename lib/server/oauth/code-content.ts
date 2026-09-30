import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

export type OAuthCodeContent = { redirect_uri: string; resource: string | null };
export type StoredOAuthCode = {
  code_hash: string;
  user_id: string;
  redirect_uri: string | null;
  resource: string | null;
  encrypted_content?: string | null;
  encryption_version?: number;
};

function context(row: Pick<StoredOAuthCode, "code_hash" | "user_id">) {
  return { scope: { kind: "user" as const, id: row.user_id },
    table: "oauth_authorization_codes", column: "content", rowId: row.code_hash };
}

export async function shouldProtectOAuthCodes(): Promise<boolean> {
  if (isContentEncryptionEnabled()) return true;
  const { data, error } = await getServiceClient()
    .from("oauth_code_content_scope").select("id").eq("id", true).maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code))
    throw new Error("Unable to resolve OAuth code protection state");
  return !!data;
}

export async function encodeOAuthCodeContent(row: Pick<StoredOAuthCode,
  "code_hash" | "user_id">, content: OAuthCodeContent):
  Promise<{ encrypted_content: string; encryption_version: number }> {
  const store = getEncryptedStore();
  const ciphertext = await store.encrypt(content, context(row));
  return { encrypted_content: ciphertext as string,
    encryption_version: store.versionOf(ciphertext) };
}

export async function decodeOAuthCodeContent(row: StoredOAuthCode):
  Promise<OAuthCodeContent> {
  if (!row.encrypted_content) {
    if (!row.redirect_uri) throw new Error("Incomplete OAuth code content");
    return { redirect_uri: row.redirect_uri, resource: row.resource };
  }
  if (row.redirect_uri !== null || row.resource !== null)
    throw new Error("OAuth code plaintext copy remains");
  const store = getEncryptedStore();
  const ciphertext = store.fromDatabase<OAuthCodeContent>(row.encrypted_content);
  if (store.formatOf(ciphertext) !== 3 ||
      store.versionOf(ciphertext) !== row.encryption_version)
    throw new Error("Invalid OAuth code envelope");
  const content = await store.decrypt(ciphertext, context(row));
  if (!content || typeof content.redirect_uri !== "string" ||
      !content.redirect_uri ||
      (content.resource !== null && typeof content.resource !== "string"))
    throw new Error("Invalid OAuth code content");
  return content;
}
