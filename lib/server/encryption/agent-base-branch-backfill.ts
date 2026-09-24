import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeAgentBaseBranch, decodeRuntimeBaseBranch,
  encodeAgentBaseBranch, encodeOrphanRuntimeBaseBranch,
  encryptedAgentBaseBranchState, isEncryptedAgentBaseBranch,
  type StoredAgentBaseBranch } from "@/lib/server/agent/run-base-branch-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";

function validate(limit: number) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_AGENT_BASE_BRANCH_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Agent base branch encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid agent base branch batch size");
  }
}

async function currentVersion(projectId: string) {
  const key = await getContentKeys().current({ kind: "project", id: projectId });
  try { return key.version; }
  finally { key.bytes.fill(0); }
}

function result() {
  return { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
}

/** Convert or rotate run base branches with a bounded compare-and-swap batch. */
export async function backfillAgentRunBaseBranchesBatch(limit = 20,
  signal?: AbortSignal) {
  validate(limit);
  const outcome = result();
  const service = getServiceClient();
  const { data, error } = await service.from("agent_runs")
    .select("id,project_id,base_branch")
    .not("base_branch", "is", null)
    .order("base_branch_encryption_checked_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan agent base branches");
  for (const row of (data ?? []) as StoredAgentBaseBranch[]) {
    if (signal?.aborted) { outcome.interrupted = true; break; }
    outcome.scanned++;
    try {
      if (!row.id || !row.project_id || !row.base_branch) {
        throw new Error("Invalid agent base branch migration scope");
      }
      const clear = (await decodeAgentBaseBranch(row)).base_branch;
      if (!clear) throw new Error("Missing agent base branch");
      const identity = { p_id: row.id, p_project_id: row.project_id,
        p_old_branch: row.base_branch };
      if (isEncryptedAgentBaseBranch(row.base_branch)) {
        const state = encryptedAgentBaseBranchState(row.base_branch);
        if (state.version === await currentVersion(row.project_id) && state.format === 3) {
          const checked = await service.rpc("migrate_agent_run_base_branch", identity);
          if (checked.error) throw new Error("Unable to mark agent base branch attempt");
          if (checked.data) outcome.unchanged++; else outcome.conflicted++;
          continue;
        }
      }
      const replacement = await encodeAgentBaseBranch(row.project_id, row.id, clear);
      if ((await decodeAgentBaseBranch({ ...row, base_branch: replacement })).base_branch !== clear) {
        throw new Error("Agent base branch migration verification failed");
      }
      if (signal?.aborted) { outcome.interrupted = true; break; }
      const committed = await service.rpc("migrate_agent_run_base_branch", {
        ...identity, p_new_branch: replacement });
      if (committed.error) throw new Error("Unable to commit agent base branch migration");
      if (committed.data) outcome.migrated++; else outcome.conflicted++;
    } catch { outcome.failed++; }
  }
  return outcome;
}

type OrphanRow = { conversation_id: string; current_run_id: null;
  base_branch_bound_run_id: string | null;
  base_branch: string | null;
  conversation: { project_id: string } | Array<{ project_id: string }> };

/** Rotate detached runtime copies that no longer have a current run. */
export async function backfillOrphanRuntimeBaseBranchesBatch(limit = 20,
  signal?: AbortSignal) {
  validate(limit);
  const outcome = result();
  const service = getServiceClient();
  const { data, error } = await service.from("agent_runtime_sessions")
    .select("conversation_id,current_run_id,base_branch,base_branch_bound_run_id,conversation:agent_conversations!inner(project_id)")
    .is("current_run_id", null).not("base_branch", "is", null)
    .order("base_branch_encryption_checked_at", { ascending: true, nullsFirst: true })
    .order("conversation_id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan orphan runtime base branches");
  for (const row of (data ?? []) as unknown as OrphanRow[]) {
    if (signal?.aborted) { outcome.interrupted = true; break; }
    outcome.scanned++;
    try {
      const conversation = Array.isArray(row.conversation)
        ? row.conversation[0] : row.conversation;
      const projectId = conversation?.project_id;
      if (!projectId || !row.conversation_id || !row.base_branch) {
        throw new Error("Invalid runtime base branch migration scope");
      }
      const clear = await decodeRuntimeBaseBranch(row, projectId);
      if (!clear) throw new Error("Missing runtime base branch");
      const identity = { p_conversation_id: row.conversation_id,
        p_project_id: projectId, p_old_branch: row.base_branch,
        p_old_bound_run_id: row.base_branch_bound_run_id };
      if (isEncryptedAgentBaseBranch(row.base_branch)) {
        const state = encryptedAgentBaseBranchState(row.base_branch);
        if (state.version === await currentVersion(projectId) && state.format === 3) {
          const checked = await service.rpc("migrate_orphan_agent_runtime_base_branch", identity);
          if (checked.error) throw new Error("Unable to mark runtime base branch attempt");
          if (checked.data) outcome.unchanged++; else outcome.conflicted++;
          continue;
        }
      }
      const replacement = await encodeOrphanRuntimeBaseBranch(projectId,
        row.conversation_id, clear);
      if (await decodeRuntimeBaseBranch({ ...row, base_branch: replacement,
        base_branch_bound_run_id: null }, projectId) !== clear) {
        throw new Error("Runtime base branch migration verification failed");
      }
      if (signal?.aborted) { outcome.interrupted = true; break; }
      const committed = await service.rpc("migrate_orphan_agent_runtime_base_branch", {
        ...identity, p_new_branch: replacement });
      if (committed.error) throw new Error("Unable to commit runtime base branch migration");
      if (committed.data) outcome.migrated++; else outcome.conflicted++;
    } catch { outcome.failed++; }
  }
  return outcome;
}
