import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeAgentDeploymentUrl, encodeAgentDeploymentUrl,
  encryptedDeploymentState, isEncryptedDeploymentUrl,
  type StoredAgentDeployment } from "@/lib/server/agent/run-deployment-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";

/** Convert and rotate a bounded deployment-affinity batch under CAS. */
export async function backfillAgentDeploymentUrlsBatch(limit = 20,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_AGENT_DEPLOYMENT_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Agent deployment encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid agent deployment batch size");
  }
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("agent_runs")
    .select("id,project_id,deployment_url")
    .not("deployment_url", "is", null)
    .order("deployment_encryption_checked_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan agent deployment URLs");
  for (const row of (data ?? []) as StoredAgentDeployment[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      if (!row.id || !row.project_id || !row.deployment_url) {
        throw new Error("Invalid agent deployment migration scope");
      }
      const decoded = await decodeAgentDeploymentUrl(row);
      if (!decoded.deployment_url) throw new Error("Missing agent deployment URL");
      const key = await getContentKeys().current({ kind: "project", id: row.project_id });
      const version = key.version;
      key.bytes.fill(0);
      const identity = { p_id: row.id, p_project_id: row.project_id,
        p_old_url: row.deployment_url };
      if (isEncryptedDeploymentUrl(row.deployment_url)) {
        const state = encryptedDeploymentState(row.deployment_url);
        if (state.version === version && state.format === 3) {
          const checked = await service.rpc("migrate_agent_run_deployment_url", identity);
          if (checked.error) throw new Error("Unable to mark agent deployment attempt");
          if (checked.data) result.unchanged++; else result.conflicted++;
          continue;
        }
      }
      const replacement = await encodeAgentDeploymentUrl(row.project_id, row.id,
        decoded.deployment_url);
      const verified = await decodeAgentDeploymentUrl({ ...row,
        deployment_url: replacement });
      if (verified.deployment_url !== decoded.deployment_url) {
        throw new Error("Agent deployment migration verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const committed = await service.rpc("migrate_agent_run_deployment_url", {
        ...identity, p_new_url: replacement,
      });
      if (committed.error) throw new Error("Unable to commit agent deployment migration");
      if (committed.data) result.migrated++; else result.conflicted++;
    } catch {
      result.failed++;
    }
  }
  return result;
}
