import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { invalidateCustomDomainCache } from "@/lib/custom-domain-lookup";
import { isPrimaryHost, normalizeHost } from "@/lib/public-hosts";
import { isVercelDomainsConfigured, listVercelProjectDomains,
  removeDomainFromVercel } from "@/lib/server/vercel-domains";

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

/** Hourly reconciliation also discovers provider orphans predating the queue. */
export async function reconcileCustomDomains() {
  if (!isVercelDomainsConfigured()) return { ok: true, skipped: true };
  const deadline = Date.now() + 40_000;
  const service = getServiceClient();
  const { error } = await service.rpc("reconcile_inactive_custom_domains");
  if (error) throw new Error("Unable to reconcile inactive custom domains");

  // The client paginates the inventory completely or fails closed. Exclude
  // operator redirects, preview environments and recently attached hostnames.
  let inventoryFailed = false;
  try {
    const inventory = await listVercelProjectDomains();
    const candidates = inventory.filter((entry) => {
      const domain = normalizeHost(entry.name);
      return !isPrimaryHost(domain) && !domain.includes("*") && domain.split(".").length >= 3 &&
        !entry.redirect && !entry.gitBranch && !entry.customEnvironmentId &&
        Number.isFinite(entry.createdAt) && entry.createdAt <= Date.now() - 10 * 60_000;
    }).map((entry) => normalizeHost(entry.name));
    for (let offset = 0; offset < candidates.length; offset += 100) {
      if (Date.now() >= deadline - 10_000) break;
      const batch = candidates.slice(offset, offset + 100);
      const { data: mappings, error: lookupError } = await service.from("custom_domains")
        .select("domain").in("domain", batch);
      if (lookupError) throw new Error("Unable to check domain inventory mapping");
      const retained = new Set((mappings ?? []).map((row) => row.domain));
      const orphans = batch.filter((domain) => !retained.has(domain)).map((domain) => ({ domain }));
      if (!orphans.length) continue;
      const { error: queueError } = await service.from("custom_domain_cleanup")
        .upsert(orphans, { onConflict: "domain", ignoreDuplicates: true });
      if (queueError) throw new Error("Unable to queue orphan custom domain");
    }
  } catch {
    // Inventory errors must not stop retries already recorded by cascades.
    inventoryFailed = true;
    console.error("[custom-domains] provider inventory unavailable");
  }

  const { data: rows, error: queueError } = await service.from("custom_domain_cleanup")
    .select("id, domain, attempts").lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at").limit(10);
  if (queueError) throw new Error("Unable to read custom domain cleanup queue");
  const counts = { removed: 0, retained: 0, deferred: 0, failed: 0 };
  for (const row of (rows ?? []) as CleanupRow[]) {
    if (Date.now() >= deadline) break;
    counts[await cleanDomain(row)]++;
  }
  return { ok: counts.failed === 0 && !inventoryFailed, inventoryFailed, ...counts };
}
