import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { decryptForgeToken, encryptForgeToken } from
  "@/lib/server/git/token-crypto";

const context = { scope: { kind: "system" as const,
  id: "00000000-0000-0000-0000-000000000000" },
  table: "forge_relay_provisioning", column: "encrypted_content",
  rowId: "singleton" };

export type ProvisioningContent = {
  relay_url: string;
  signing_key: string;
  webhook_secret: string;
};

export type ProvisioningRow = {
  relay_url: string | null;
  signing_key_encrypted: string | null;
  webhook_secret_encrypted: string | null;
  encrypted_content?: string | null;
  encryption_version?: number;
};

export async function shouldProtectProvisioning(service?: SupabaseClient):
  Promise<boolean> {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_RELAY_PROVISIONING_ENCRYPTION_ENABLED === "true") {
    return true;
  }
  const { data, error } = await (service ?? getServiceClient())
    .from("forge_relay_provisioning_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code)) {
    throw new Error("Unable to resolve relay provisioning protection state");
  }
  if (!process.env.MINDDY_DATA_ROOT_KEY && !data) return false;
  return !!data;
}

export async function decodeProvisioning(row: ProvisioningRow):
  Promise<ProvisioningContent> {
  if (row.encryption_version) {
    if (!row.encrypted_content || row.relay_url !== null ||
        row.signing_key_encrypted !== null ||
        row.webhook_secret_encrypted !== null) {
      throw new Error("Invalid protected relay provisioning row");
    }
    const store = getEncryptedStore();
    const ciphertext = store.fromDatabase<ProvisioningContent>(
      row.encrypted_content);
    if (store.formatOf(ciphertext) !== 3 ||
        store.versionOf(ciphertext) !== row.encryption_version) {
      throw new Error("Relay provisioning key version mismatch");
    }
    const value = await store.decrypt<ProvisioningContent>(
      ciphertext,context);
    if (!valid(value)) throw new Error("Invalid relay provisioning content");
    return value;
  }
  if (row.encrypted_content || !row.relay_url ||
      !row.signing_key_encrypted || !row.webhook_secret_encrypted) {
    throw new Error("Invalid legacy relay provisioning row");
  }
  const value = { relay_url: row.relay_url,
    signing_key: decryptForgeToken(row.signing_key_encrypted),
    webhook_secret: decryptForgeToken(row.webhook_secret_encrypted) };
  if (!valid(value)) throw new Error("Invalid legacy relay provisioning content");
  return value;
}

function valid(value: unknown): value is ProvisioningContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.relay_url === "string" && row.relay_url.length > 0 &&
    typeof row.signing_key === "string" && row.signing_key.length > 0 &&
    typeof row.webhook_secret === "string" && row.webhook_secret.length > 0;
}

export async function encodeProvisioning(value: ProvisioningContent,
  options: { service?: SupabaseClient; force?: boolean } = {}):
  Promise<ProvisioningRow> {
  if (!valid(value)) throw new Error("Incomplete relay provisioning content");
  if (!options.force && !await shouldProtectProvisioning(options.service)) {
    return { relay_url: value.relay_url,
      signing_key_encrypted: encryptForgeToken(value.signing_key),
      webhook_secret_encrypted: encryptForgeToken(value.webhook_secret) };
  }
  const store = getEncryptedStore();
  const encrypted_content = await store.encrypt(value,context);
  return { relay_url: null, signing_key_encrypted: null,
    webhook_secret_encrypted: null, encrypted_content,
    encryption_version: store.versionOf(encrypted_content) };
}
