import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { agentPrUrlState, decodeAgentPrUrl, decodeAgentPrUrlValue,
  encodeAgentPrUrl, encodeOrphanArtifactUrl, isEncryptedAgentPrUrl } from
  "@/lib/server/agent/run-pr-url-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";

function validate(limit: number) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_AGENT_PR_URL_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Agent PR URL encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid agent PR URL batch size");
  }
}

function counters() {
  return { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
}

async function version(projectId: string) {
  const key = await getContentKeys().current({ kind: "project", id: projectId });
  try { return key.version; }
  finally { key.bytes.fill(0); }
}

type Artifact = { id: string; run_id: string | null; url: string;
  url_bound_run_id: string | null;
  conversation: { project_id: string } | Array<{ project_id: string }> };

/** Convert artifact URLs before their source run so no clear copy survives. */
export async function backfillAgentArtifactUrlsBatch(limit = 20,
  signal?: AbortSignal) {
  validate(limit);
  const result = counters();
  const service = getServiceClient();
  const { data, error } = await service.from("agent_artifacts")
    .select("id,run_id,url,url_bound_run_id,conversation:agent_conversations!inner(project_id)")
    .not("url", "is", null)
    .order("url_encryption_checked_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan agent artifact URLs");
  for (const artifact of (data ?? []) as unknown as Artifact[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const conversation = Array.isArray(artifact.conversation)
        ? artifact.conversation[0] : artifact.conversation;
      const projectId = conversation?.project_id;
      if (!projectId) throw new Error("Agent artifact URL scope is unavailable");
      const identity = { p_id: artifact.id, p_project_id: projectId,
        p_old_url: artifact.url, p_old_bound_run_id: artifact.url_bound_run_id };
      const keyVersion = await version(projectId);
      if (isEncryptedAgentPrUrl(artifact.url)) {
        const state = agentPrUrlState(artifact.url);
        if (state.version === keyVersion && state.format === 3) {
          const checked = await service.rpc("migrate_agent_artifact_url", identity);
          if (checked.error) throw new Error("Unable to mark artifact URL attempt");
          if (checked.data) result.unchanged++; else result.conflicted++;
          continue;
        }
      }
      const plain = await decodeAgentPrUrlValue(projectId,
        artifact.url_bound_run_id, artifact.id, artifact.url);
      if (!plain) throw new Error("Missing agent artifact URL");
      const replacement = await encodeOrphanArtifactUrl(projectId, artifact.id, plain);
      if (await decodeAgentPrUrlValue(projectId, null, artifact.id,
        replacement) !== plain) {
        throw new Error("Agent artifact URL verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const committed = await service.rpc("migrate_agent_artifact_url", {
        ...identity, p_new_url: replacement,
      });
      if (committed.error) throw new Error("Unable to convert artifact URL");
      if (committed.data) result.migrated++; else result.conflicted++;
    } catch { result.failed++; }
  }
  return result;
}

/** Convert run URLs and let SQL copy their ciphertext to current PR artifacts. */
export async function backfillAgentRunPrUrlsBatch(limit = 20,
  signal?: AbortSignal) {
  validate(limit);
  const result = counters();
  const service = getServiceClient();
  const { data, error } = await service.from("agent_runs")
    .select("id,project_id,pr_url").not("pr_url", "is", null)
    .order("pr_url_encryption_checked_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan agent run PR URLs");
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const identity = { p_id: row.id, p_project_id: row.project_id,
        p_old_url: row.pr_url };
      const keyVersion = await version(row.project_id);
      if (isEncryptedAgentPrUrl(row.pr_url)) {
        const state = agentPrUrlState(row.pr_url);
        if (state.version === keyVersion && state.format === 3) {
          const checked = await service.rpc("migrate_agent_run_pr_url", identity);
          if (checked.error) throw new Error("Unable to mark run PR URL attempt");
          if (checked.data) result.unchanged++; else result.conflicted++;
          continue;
        }
      }
      const plain = (await decodeAgentPrUrl(row)).pr_url;
      if (!plain) throw new Error("Missing agent run PR URL");
      const replacement = await encodeAgentPrUrl(row.project_id, row.id, plain);
      if ((await decodeAgentPrUrl({ ...row, pr_url: replacement })).pr_url !== plain) {
        throw new Error("Agent run PR URL verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const committed = await service.rpc("migrate_agent_run_pr_url", {
        ...identity, p_new_url: replacement,
      });
      if (committed.error) throw new Error("Unable to convert run PR URL");
      if (committed.data) result.migrated++; else result.conflicted++;
    } catch { result.failed++; }
  }
  return result;
}
