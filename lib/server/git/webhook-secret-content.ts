import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RepoProviderId } from "@/lib/repo-providers";
import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from
  "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { decryptForgeToken, encryptForgeToken } from "./token-crypto";

const scope = { kind: "system" as const,
  id: "00000000-0000-0000-0000-000000000000" };

function context(provider: RepoProviderId, externalRepoId: string) {
  if (!provider || !externalRepoId) throw new Error("Missing webhook repository");
  return { scope, table: "project_git_links",
    column: "webhook_secret_encrypted",
    rowId: JSON.stringify([provider, externalRepoId]) };
}

export function protectedWebhookSecretVersion(value: string | null): number {
  if (!value) return 0;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return 0;
    const envelope = parsed as { format?: unknown; keyVersion?: unknown };
    return envelope.format === 3 && Number.isSafeInteger(envelope.keyVersion) &&
      Number(envelope.keyVersion) > 0 ? Number(envelope.keyVersion) : 0;
  } catch { return 0; }
}

export async function shouldProtectRepoWebhookSecret(
  service?: SupabaseClient): Promise<boolean> {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_REPO_WEBHOOK_SECRET_ENCRYPTION_ENABLED === "true") {
    return true;
  }
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await (service ?? getServiceClient())
    .from("project_git_webhook_secret_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code)) {
    throw new Error("Unable to resolve repository webhook protection state");
  }
  return !!data;
}

export async function decodeRepoWebhookSecret(value: string | null,
  provider: RepoProviderId, externalRepoId: string): Promise<string | null> {
  if (!value) return null;
  if (protectedWebhookSecretVersion(value) === 0) {
    return decryptForgeToken(value);
  }
  try {
    return await getEncryptedStore().decrypt<string>(
      getEncryptedStore().fromDatabase<string>(value),
      context(provider, externalRepoId));
  } catch { return null; }
}

export async function encodeRepoWebhookSecret(value: string,
  provider: RepoProviderId, externalRepoId: string,
  options: { service?: SupabaseClient; force?: boolean } = {}):
  Promise<string> {
  if (!value) throw new Error("Empty webhook secret");
  if (!options.force && !await shouldProtectRepoWebhookSecret(options.service)) {
    return encryptForgeToken(value);
  }
  return getEncryptedStore().encrypt(value,context(provider, externalRepoId));
}
