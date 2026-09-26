import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import type { VercelVerificationRecord } from "./vercel-domains";

const marker = "mdye3:";
const scope = { kind: "system" as const,
  id: "00000000-0000-0000-0000-000000000000" };

function binding(id: string) {
  if (!id) throw new Error("Custom domain identity is required");
  return { scope, table: "custom_domains", column: "verification", rowId: id };
}

export async function shouldProtectDomainVerification(
  service: SupabaseClient = getServiceClient(),
): Promise<boolean> {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_CUSTOM_DOMAIN_VERIFICATION_ENCRYPTION_ENABLED === "true")
    return true;
  const { data, error } = await service.from("custom_domain_verification_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code))
    throw new Error("Unable to resolve custom domain protection state");
  return !!data;
}

function valid(value: unknown): value is VercelVerificationRecord[] {
  return Array.isArray(value) && value.every((record) =>
    record && typeof record === "object" &&
    typeof record.type === "string" &&
    typeof record.domain === "string" &&
    typeof record.value === "string" &&
    (record.reason === undefined || typeof record.reason === "string"));
}

export async function encodeDomainVerification(
  id: string, value: VercelVerificationRecord[] | null,
): Promise<string | null> {
  if (value === null) return null;
  if (!valid(value)) throw new Error("Invalid custom domain verification");
  const cipher = await getEncryptedStore().encrypt(value, binding(id));
  return `${marker}${cipher}`;
}

export async function decodeDomainVerification(
  id: string, value: unknown,
): Promise<VercelVerificationRecord[] | null> {
  if (value === null) return null;
  if (valid(value)) return value;
  if (typeof value !== "string" || !value.startsWith(marker))
    throw new Error("Invalid custom domain verification");
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<VercelVerificationRecord[]>(
    value.slice(marker.length));
  if (store.formatOf(cipher) !== 3)
    throw new Error("Invalid custom domain envelope");
  const opened = await store.decrypt(cipher, binding(id));
  if (!valid(opened)) throw new Error("Invalid protected domain verification");
  return opened;
}

export function domainVerificationVersion(value: unknown): number {
  if (typeof value !== "string" || !value.startsWith(marker)) return 0;
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(value.slice(marker.length));
  if (store.formatOf(cipher) !== 3)
    throw new Error("Invalid custom domain envelope");
  return store.versionOf(cipher);
}
