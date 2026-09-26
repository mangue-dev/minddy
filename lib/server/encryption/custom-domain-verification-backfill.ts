import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeDomainVerification, domainVerificationVersion,
  encodeDomainVerification } from "@/lib/server/custom-domain-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";

const scope = { kind: "system" as const,
  id: "00000000-0000-0000-0000-000000000000" };
type Row = { id: string; content_revision: number; verification: unknown };

/** Rotate pending DNS challenges under the domain row's revision lock. */
export async function backfillCustomDomainVerificationBatch(
  limit = 25, signal?: AbortSignal,
) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_CUSTOM_DOMAIN_VERIFICATION_ENCRYPTION_ENABLED !== "true")
    throw new Error("Custom domain verification encryption is not enabled");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Invalid custom domain verification batch size");
  const result = { scanned: 0, migrated: 0, unchanged: 0,
    conflicted: 0, failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("custom_domains")
    .select("id,content_revision,verification")
    .not("verification", "is", null)
    .order("verification_encryption_attempted_at", { ascending: true,
      nullsFirst: true }).order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan custom domain verification");
  for (const row of (data ?? []) as Row[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const key = await getContentKeys().current(scope);
      const version = key.version;
      key.bytes.fill(0);
      const plain = await decodeDomainVerification(row.id, row.verification);
      if (plain === null) throw new Error("Missing domain verification");
      const fresh = domainVerificationVersion(row.verification) === version;
      const sealed = fresh ? row.verification as string
        : await encodeDomainVerification(row.id, plain);
      if (JSON.stringify(await decodeDomainVerification(row.id, sealed)) !==
          JSON.stringify(plain))
        throw new Error("Custom domain verification mismatch");
      if (signal?.aborted) { result.interrupted = true; break; }
      const now = new Date().toISOString();
      const { data: saved, error: writeError } = await service
        .from("custom_domains")
        .update({ verification: sealed,
          verification_encryption_checked_at: now,
          verification_encryption_attempted_at: now })
        .eq("id", row.id).eq("content_revision", row.content_revision)
        .select("id").maybeSingle();
      if (writeError) throw new Error("Unable to migrate domain verification");
      if (!saved) result.conflicted++;
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch {
      result.failed++;
      await service.from("custom_domains")
        .update({ verification_encryption_attempted_at:
          new Date().toISOString() })
        .eq("id", row.id).eq("content_revision", row.content_revision);
    }
  }
  return result;
}
