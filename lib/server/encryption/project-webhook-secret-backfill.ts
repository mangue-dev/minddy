import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeRepoWebhookSecret, encodeRepoWebhookSecret,
  protectedWebhookSecretVersion } from
  "@/lib/server/git/webhook-secret-content";
import type { RepoProviderId } from "@/lib/repo-providers";
import { getContentKeys } from "./registry";
import { isContentEncryptionEnabled } from "./content-config";

/** Convert and rotate per-repository hook secrets with exact-value CAS. */
export async function backfillProjectWebhookSecretsBatch(limit = 30,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled()) {
    throw new Error("Repository webhook encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid repository webhook batch size");
  }
  const service = getServiceClient();
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const { data, error } = await service.from("project_git_links")
    .select("id,provider,external_repo_id,webhook_secret_encrypted")
    .not("webhook_secret_encrypted", "is", null)
    .order("webhook_secret_attempted_at", { ascending: true,
      nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan repository webhook secrets");
  const scope = { kind: "system" as const,
    id: "00000000-0000-0000-0000-000000000000" };
  const key = await getContentKeys().current(scope);
  const currentVersion = key.version;
  key.bytes.fill(0);
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    const provider = row.provider as RepoProviderId;
    const prior = row.webhook_secret_encrypted as string;
    try {
      const plain = await decodeRepoWebhookSecret(prior,provider,
        row.external_repo_id);
      if (!plain) throw new Error("Invalid repository webhook secret");
      const fresh = protectedWebhookSecretVersion(prior) === currentVersion;
      const cipher = fresh ? prior : await encodeRepoWebhookSecret(plain,
        provider,row.external_repo_id,{ service, force: true });
      if (await decodeRepoWebhookSecret(cipher,provider,
        row.external_repo_id) !== plain) {
        throw new Error("Repository webhook migration mismatch");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const now = new Date().toISOString();
      const write = await service.from("project_git_links")
        .update({ webhook_secret_encrypted: cipher,
          webhook_secret_checked_at: now,
          webhook_secret_attempted_at: now })
        .eq("id", row.id).eq("webhook_secret_encrypted",prior)
        .select("id").maybeSingle();
      if (write.error) throw new Error("Unable to migrate repository webhook");
      if (!write.data) result.conflicted++;
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch {
      result.failed++;
      if (signal?.aborted) { result.interrupted = true; break; }
      await service.from("project_git_links")
        .update({ webhook_secret_attempted_at: new Date().toISOString() })
        .eq("id", row.id).eq("webhook_secret_encrypted", prior);
    }
  }
  return result;
}
