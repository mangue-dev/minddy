import "server-only";

import { markAgentBackfillAttempt } from "./agent-backfill-attempt";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeAgentWorkBranch, decodeRuntimeWorkBranch,
  decodeWorkBranchValue, encodeAgentWorkBranch, encodeOrphanArtifactBranch,
  encodeOrphanRuntimeWorkBranch, encryptedWorkBranchState,
  isEncryptedWorkBranch, workBranchArtifactRef,
  type StoredAgentWorkBranch } from "@/lib/server/agent/run-work-branch-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";

function validate(limit: number) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_AGENT_WORK_BRANCH_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Agent work branch encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid agent work branch batch size");
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

type ArtifactRow = { id: string; conversation_id: string; run_id: string | null;
  ref: string; ref_ciphertext: string | null; ref_bound_run_id: string | null;
  conversation: { project_id: string } | Array<{ project_id: string }> };

/** Convert artifact refs before run copies so an existing plaintext ref cannot survive. */
export async function backfillAgentArtifactBranchesBatch(limit = 20,
  signal?: AbortSignal) {
  validate(limit);
  const outcome = result();
  const service = getServiceClient();
  const { data, error } = await service.from("agent_artifacts")
    .select("id,conversation_id,run_id,ref,ref_ciphertext,ref_bound_run_id,conversation:agent_conversations!inner(project_id)")
    .eq("kind", "branch")
    .order("ref_encryption_attempted_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan agent branch artifacts");
  for (const row of (data ?? []) as unknown as ArtifactRow[]) {
    if (signal?.aborted) { outcome.interrupted = true; break; }
    outcome.scanned++;
    try {
      if (!await markAgentBackfillAttempt(service, "agent_artifacts", "ref_encryption_checked_at",
        row as Record<string, unknown>)) {
        outcome.conflicted++;
        continue;
      }
      const conversation = Array.isArray(row.conversation)
        ? row.conversation[0] : row.conversation;
      const projectId = conversation?.project_id;
      if (!projectId || !row.id || !row.ref) throw new Error("Invalid artifact scope");
      const clear = row.ref_ciphertext
        ? await decodeWorkBranchValue(projectId, row.ref_bound_run_id,
          row.id, row.ref_ciphertext)
        : row.ref;
      const identity = { p_id: row.id, p_project_id: projectId,
        p_old_ref: row.ref, p_old_cipher: row.ref_ciphertext,
        p_old_bound_run_id: row.ref_bound_run_id };
      if (row.ref_ciphertext && isEncryptedWorkBranch(row.ref_ciphertext)) {
        const state = encryptedWorkBranchState(row.ref_ciphertext);
        if (state.version === await currentVersion(projectId) && state.format === 3) {
          const checked = await service.rpc("migrate_agent_artifact_branch", identity);
          if (checked.error) throw new Error("Unable to mark artifact attempt");
          if (checked.data) outcome.unchanged++; else outcome.conflicted++;
          continue;
        }
      }
      const cipher = await encodeOrphanArtifactBranch(projectId, row.id, clear);
      const ref = workBranchArtifactRef(cipher);
      if (await decodeWorkBranchValue(projectId, null, row.id, cipher) !== clear) {
        throw new Error("Artifact migration verification failed");
      }
      if (signal?.aborted) { outcome.interrupted = true; break; }
      const committed = await service.rpc("migrate_agent_artifact_branch", {
        ...identity, p_new_ref: ref, p_new_cipher: cipher });
      if (committed.error) throw new Error("Unable to commit artifact migration");
      if (committed.data) outcome.migrated++; else outcome.conflicted++;
    } catch { outcome.failed++; }
  }
  return outcome;
}

/** Convert or rotate run work branches and their current SQL copies atomically. */
export async function backfillAgentRunWorkBranchesBatch(limit = 20,
  signal?: AbortSignal) {
  validate(limit);
  const outcome = result();
  const service = getServiceClient();
  const { data, error } = await service.from("agent_runs")
    .select("id,project_id,branch_name")
    .not("branch_name", "is", null)
    .order("work_branch_encryption_attempted_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan agent work branches");
  for (const row of (data ?? []) as StoredAgentWorkBranch[]) {
    if (signal?.aborted) { outcome.interrupted = true; break; }
    outcome.scanned++;
    try {
      if (!await markAgentBackfillAttempt(service, "agent_runs", "work_branch_encryption_checked_at",
        row as Record<string, unknown>)) {
        outcome.conflicted++;
        continue;
      }
      if (!row.id || !row.project_id || row.branch_name === null) {
        throw new Error("Invalid agent work branch migration scope");
      }
      const clear = (await decodeAgentWorkBranch(row)).branch_name!;
      const identity = { p_id: row.id, p_project_id: row.project_id,
        p_old_branch: row.branch_name };
      if (isEncryptedWorkBranch(row.branch_name)) {
        const state = encryptedWorkBranchState(row.branch_name);
        if (state.version === await currentVersion(row.project_id) && state.format === 3) {
          const checked = await service.rpc("migrate_agent_run_work_branch", identity);
          if (checked.error) throw new Error("Unable to mark work branch attempt");
          if (checked.data) outcome.unchanged++; else outcome.conflicted++;
          continue;
        }
      }
      const replacement = await encodeAgentWorkBranch(row.project_id, row.id, clear);
      if ((await decodeAgentWorkBranch({ ...row, branch_name: replacement })).branch_name !== clear) {
        throw new Error("Work branch migration verification failed");
      }
      if (signal?.aborted) { outcome.interrupted = true; break; }
      const committed = await service.rpc("migrate_agent_run_work_branch", {
        ...identity, p_new_branch: replacement });
      if (committed.error) throw new Error("Unable to commit work branch migration");
      if (committed.data) outcome.migrated++; else outcome.conflicted++;
    } catch { outcome.failed++; }
  }
  return outcome;
}

type RuntimeRow = { conversation_id: string; current_run_id: null;
  work_branch_bound_run_id: string | null; work_branch: string | null;
  conversation: { project_id: string } | Array<{ project_id: string }> };

/** Rotate detached runtime copies under a stable conversation binding. */
export async function backfillOrphanRuntimeWorkBranchesBatch(limit = 20,
  signal?: AbortSignal) {
  validate(limit);
  const outcome = result();
  const service = getServiceClient();
  const { data, error } = await service.from("agent_runtime_sessions")
    .select("conversation_id,current_run_id,work_branch,work_branch_bound_run_id,conversation:agent_conversations!inner(project_id)")
    .is("current_run_id", null).not("work_branch", "is", null)
    .order("work_branch_encryption_attempted_at", { ascending: true, nullsFirst: true })
    .order("conversation_id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan orphan runtime work branches");
  for (const row of (data ?? []) as unknown as RuntimeRow[]) {
    if (signal?.aborted) { outcome.interrupted = true; break; }
    outcome.scanned++;
    try {
      if (!await markAgentBackfillAttempt(service, "agent_runtime_sessions", "work_branch_encryption_checked_at",
        row as Record<string, unknown>, "conversation_id")) {
        outcome.conflicted++;
        continue;
      }
      const conversation = Array.isArray(row.conversation)
        ? row.conversation[0] : row.conversation;
      const projectId = conversation?.project_id;
      if (!projectId || !row.conversation_id || row.work_branch === null) {
        throw new Error("Invalid runtime work branch migration scope");
      }
      const clear = await decodeRuntimeWorkBranch(row, projectId);
      const identity = { p_conversation_id: row.conversation_id,
        p_project_id: projectId, p_old_branch: row.work_branch,
        p_old_bound_run_id: row.work_branch_bound_run_id };
      if (isEncryptedWorkBranch(row.work_branch)) {
        const state = encryptedWorkBranchState(row.work_branch);
        if (state.version === await currentVersion(projectId) && state.format === 3) {
          const checked = await service.rpc("migrate_orphan_agent_runtime_work_branch", identity);
          if (checked.error) throw new Error("Unable to mark runtime attempt");
          if (checked.data) outcome.unchanged++; else outcome.conflicted++;
          continue;
        }
      }
      const replacement = await encodeOrphanRuntimeWorkBranch(projectId,
        row.conversation_id, clear!);
      if (await decodeRuntimeWorkBranch({ ...row, work_branch: replacement,
        work_branch_bound_run_id: null }, projectId) !== clear) {
        throw new Error("Runtime migration verification failed");
      }
      if (signal?.aborted) { outcome.interrupted = true; break; }
      const committed = await service.rpc("migrate_orphan_agent_runtime_work_branch", {
        ...identity, p_new_branch: replacement });
      if (committed.error) throw new Error("Unable to commit runtime migration");
      if (committed.data) outcome.migrated++; else outcome.conflicted++;
    } catch { outcome.failed++; }
  }
  return outcome;
}
