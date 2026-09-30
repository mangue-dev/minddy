import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { invalidateCustomDomainCache } from "@/lib/custom-domain-lookup";
import { isPrimaryHost, normalizeHost } from "@/lib/public-hosts";
import { isVercelDomainsConfigured, removeDomainFromVercel } from "@/lib/server/vercel-domains";

/** Shared by attachment, replacement, explicit removal and background cleanup. */
export async function acquireDomainLease(domain: string): Promise<string | null> {
  const { data, error } = await getServiceClient().rpc("acquire_custom_domain_lease", {
    p_domain: domain,
  });
  if (error) throw new Error("Unable to acquire custom domain lease");
  return data as string | null;
}

export async function releaseDomainLease(domain: string, token: string): Promise<void> {
  const { error } = await getServiceClient().rpc("release_custom_domain_lease", {
    p_domain: domain, p_token: token,
  });
  if (error) console.error("[custom-domains] lease release failed");
}

type CleanupRow = { id: string; domain: string; attempts: number };
type CleanupState = "removed" | "retained" | "deferred" | "failed";

async function cleanDomain(row: CleanupRow): Promise<CleanupState> {
  const service = getServiceClient();
  const token = await acquireDomainLease(row.domain);
  if (!token) return "deferred";
  try {
    // Read after taking the hostname lease. A newer mapping owns its attachment.
    const { data: retained, error } = await service.from("custom_domains")
      .select("id").eq("domain", row.domain).maybeSingle();
    if (error) throw new Error("Unable to check retained custom domain");
    const protectedHost = isPrimaryHost(normalizeHost(row.domain));
    if (!retained && !protectedHost) {
      const removed = await removeDomainFromVercel(row.domain);
      if (!removed.ok) throw new Error("Unable to detach custom domain");
    }
    const { error: ackError } = await service.from("custom_domain_cleanup")
      .delete().eq("domain", row.domain).eq("id", row.id);
    if (ackError) throw new Error("Unable to acknowledge custom domain cleanup");
    invalidateCustomDomainCache(row.domain);
    return retained || protectedHost ? "retained" : "removed";
  } catch {
    const { error } = await service.from("custom_domain_cleanup").update({
      attempts: row.attempts + 1,
      next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    }).eq("domain", row.domain).eq("id", row.id);
    console.error("[custom-domains] cleanup deferred", error ? "(retry update failed)" : "");
    return "failed";
  } finally {
    await releaseDomainLease(row.domain, token);
  }
}

/** Target deletion is already committed; provider outages must not undo it. */
export async function cleanRemovedDomain(domain: string): Promise<void> {
  invalidateCustomDomainCache(domain);
  if (!isVercelDomainsConfigured()) return;
  try {
    const { data, error } = await getServiceClient().from("custom_domain_cleanup")
      .select("id, domain, attempts").eq("domain", domain).maybeSingle();
    if (error) throw new Error("Unable to read custom domain cleanup");
    if (data) await cleanDomain(data as CleanupRow);
  } catch {
    console.error("[custom-domains] immediate cleanup deferred to reconciliation");
  }
}

/** Reconcile inactive Minddy mappings and retry their durable deletion entries. */
export async function reconcileCustomDomains() {
  if (!isVercelDomainsConfigured()) return { ok: true, skipped: true };
  const deadline = Date.now() + 40_000;
  const service = getServiceClient();
  const { error } = await service.rpc("reconcile_inactive_custom_domains");
  if (error) throw new Error("Unable to reconcile inactive custom domains");

  // A missing mapping alone does not establish Minddy ownership. Only deletion
  // triggers enqueue domains, including cascades and reconciled inactive targets.
  // Provider-only aliases without that evidence belong to the operator.
  const { data: rows, error: queueError } = await service.from("custom_domain_cleanup")
    .select("id, domain, attempts").lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at").limit(10);
  if (queueError) throw new Error("Unable to read custom domain cleanup queue");
  const counts = { removed: 0, retained: 0, deferred: 0, failed: 0 };
  for (const row of (rows ?? []) as CleanupRow[]) {
    if (Date.now() >= deadline) break;
    counts[await cleanDomain(row)]++;
  }
  return { ok: counts.failed === 0, ...counts };
}
