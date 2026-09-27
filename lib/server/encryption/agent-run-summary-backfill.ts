import "server-only";

import { markAgentBackfillAttempt } from "./agent-backfill-attempt";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeRunSummary, decodeTurnSummaryValue,
  encodeRunSummary, encodeTurnSummary, encryptedRunSummaryState,
  isEncryptedRunSummary } from "@/lib/server/agent/run-summary-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";

type SummaryRow = { id: string; outcome: string | null; error_message: string | null };
type RunRow = SummaryRow & { project_id: string };
type TurnRow = SummaryRow & { run_id: string | null;
  conversation: { project_id: string } | Array<{ project_id: string }> };

function validate(limit: number) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_AGENT_SUMMARY_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Agent summary encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid agent summary batch size");
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

function current(value: string | null, keyVersion: number) {
  return value === null || (isEncryptedRunSummary(value) &&
    encryptedRunSummaryState(value).version === keyVersion &&
    encryptedRunSummaryState(value).format === 3);
}

/** Convert run summaries before their SQL-created turn copies. */
export async function backfillAgentRunSummariesBatch(limit = 20,
  signal?: AbortSignal) {
  validate(limit);
  const result = counters();
  const service = getServiceClient();
  const { data, error } = await service.from("agent_runs")
    .select("id,project_id,outcome,error_message")
    .or("outcome.not.is.null,error_message.not.is.null")
    .order("summary_encryption_attempted_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan agent run summaries");
  for (const row of (data ?? []) as RunRow[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      if (!await markAgentBackfillAttempt(service, "agent_runs", "summary_encryption_checked_at",
        row as Record<string, unknown>)) {
        result.conflicted++;
        continue;
      }
      const identity = { p_id: row.id, p_project_id: row.project_id,
        p_old_outcome: row.outcome, p_old_error: row.error_message };
      const keyVersion = await version(row.project_id);
      if (current(row.outcome, keyVersion) && current(row.error_message, keyVersion)) {
        await decodeRunSummary(row);
        const checked = await service.rpc("migrate_agent_run_summary", identity);
        if (checked.error) throw new Error("Unable to mark run summary attempt");
        if (checked.data) result.unchanged++; else result.conflicted++;
        continue;
      }
      const decoded = await decodeRunSummary(row);
      const replacement = { outcome: await encodeRunSummary(row.project_id, row.id,
        "outcome", decoded.outcome ?? null),
      error_message: await encodeRunSummary(row.project_id, row.id,
        "error_message", decoded.error_message ?? null) };
      const verified = await decodeRunSummary({ ...row, ...replacement });
      if (verified.outcome !== decoded.outcome ||
          verified.error_message !== decoded.error_message) {
        throw new Error("Run summary verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const written = await service.rpc("migrate_agent_run_summary", {
        ...identity, p_new_outcome: replacement.outcome,
        p_new_error: replacement.error_message, p_write: true,
      });
      if (written.error) throw new Error("Unable to convert run summary");
      if (written.data) result.migrated++; else result.conflicted++;
    } catch { result.failed++; }
  }
  return result;
}

/** Convert historical turn values independently of their latest run. */
export async function backfillAgentTurnSummariesBatch(limit = 20,
  signal?: AbortSignal) {
  validate(limit);
  const result = counters();
  const service = getServiceClient();
  const { data, error } = await service.from("agent_turns")
    .select("id,run_id,outcome,error_message,conversation:agent_conversations!inner(project_id)")
    .or("outcome.not.is.null,error_message.not.is.null")
    .order("summary_encryption_attempted_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan agent turn summaries");
  for (const row of (data ?? []) as unknown as TurnRow[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      if (!await markAgentBackfillAttempt(service, "agent_turns", "summary_encryption_checked_at",
        row as Record<string, unknown>)) {
        result.conflicted++;
        continue;
      }
      const conversation = Array.isArray(row.conversation)
        ? row.conversation[0] : row.conversation;
      const projectId = conversation?.project_id;
      if (!projectId) throw new Error("Turn summary scope is unavailable");
      const identity = { p_id: row.id, p_project_id: projectId,
        p_old_outcome: row.outcome, p_old_error: row.error_message };
      const keyVersion = await version(projectId);
      if (current(row.outcome, keyVersion) && current(row.error_message, keyVersion)) {
        await Promise.all([
          decodeTurnSummaryValue(projectId, row.id, row.run_id, "outcome", row.outcome),
          decodeTurnSummaryValue(projectId, row.id, row.run_id,
            "error_message", row.error_message),
        ]);
        const checked = await service.rpc("migrate_agent_turn_summary", identity);
        if (checked.error) throw new Error("Unable to mark turn summary attempt");
        if (checked.data) result.unchanged++; else result.conflicted++;
        continue;
      }
      const [outcome, errorMessage] = await Promise.all([
        decodeTurnSummaryValue(projectId, row.id, row.run_id, "outcome", row.outcome),
        decodeTurnSummaryValue(projectId, row.id, row.run_id,
          "error_message", row.error_message),
      ]);
      const replacement = { outcome: await encodeTurnSummary(projectId, row.id,
        row.run_id, "outcome", outcome),
      error_message: await encodeTurnSummary(projectId, row.id, row.run_id,
        "error_message", errorMessage) };
      if (await decodeTurnSummaryValue(projectId, row.id, row.run_id,
        "outcome", replacement.outcome) !== outcome ||
          await decodeTurnSummaryValue(projectId, row.id, row.run_id,
            "error_message", replacement.error_message) !== errorMessage) {
        throw new Error("Turn summary verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const written = await service.rpc("migrate_agent_turn_summary", {
        ...identity, p_new_outcome: replacement.outcome,
        p_new_error: replacement.error_message, p_write: true,
      });
      if (written.error) throw new Error("Unable to convert turn summary");
      if (written.data) result.migrated++; else result.conflicted++;
    } catch { result.failed++; }
  }
  return result;
}
