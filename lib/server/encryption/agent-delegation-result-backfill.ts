import "server-only";

import { isDeepStrictEqual } from "node:util";

import { markAgentBackfillAttempt } from "./agent-backfill-attempt";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeDelegationResult, encodeDelegationResult,
  type StoredDelegationResult } from "@/lib/server/agent/run-delegation-result-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys, getEncryptedStore } from "./registry";

type ResultRow = StoredDelegationResult & {
  delegation_result_ciphertext: string | null;
  delegation_result_encryption_version: number;
};

/** Convert and rotate a bounded worker-result batch under compare-and-swap. */
export async function backfillAgentDelegationResultsBatch(limit = 20,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled()) {
    throw new Error("Agent result encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid agent result batch size");
  }
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("agent_runs")
    .select("id,project_id,delegation_result,delegation_result_ciphertext,delegation_result_encryption_version")
    .or("delegation_result.not.is.null,delegation_result_ciphertext.not.is.null")
    .order("delegation_result_encryption_attempted_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan agent delegation results");
  for (const row of (data ?? []) as ResultRow[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      if (!await markAgentBackfillAttempt(service, "agent_runs", "delegation_result_encryption_checked_at",
        row as Record<string, unknown>)) {
        result.conflicted++;
        continue;
      }
      if (!row.id || !row.project_id ||
          !Number.isSafeInteger(row.delegation_result_encryption_version) ||
          row.delegation_result_encryption_version < 0) {
        throw new Error("Invalid agent result scope");
      }
      const identity = { p_id: row.id, p_project_id: row.project_id,
        p_old_result: row.delegation_result,
        p_old_cipher: row.delegation_result_ciphertext,
        p_old_version: row.delegation_result_encryption_version };
      const decoded = await decodeDelegationResult(row);
      if (!decoded.delegation_result) throw new Error("Missing delegation result");
      const key = await getContentKeys().current({ kind: "project", id: row.project_id });
      const version = key.version;
      key.bytes.fill(0);
      if (row.delegation_result_encryption_version === version &&
          row.delegation_result_ciphertext &&
          getEncryptedStore().formatOf(getEncryptedStore().fromDatabase(
            row.delegation_result_ciphertext)) === 3) {
        const checked = await service.rpc("migrate_agent_delegation_result", identity);
        if (checked.error) throw new Error("Unable to mark agent result attempt");
        if (checked.data) result.unchanged++; else result.conflicted++;
        continue;
      }
      const replacement = await encodeDelegationResult(row.project_id, row.id,
        decoded.delegation_result);
      const verified = await decodeDelegationResult({ ...row, ...replacement });
      if (!isDeepStrictEqual(verified.delegation_result, decoded.delegation_result)) {
        throw new Error("Agent result migration verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const committed = await service.rpc("migrate_agent_delegation_result", {
        ...identity, p_cipher: replacement.delegation_result_ciphertext,
        p_version: replacement.delegation_result_encryption_version,
      });
      if (committed.error) throw new Error("Unable to commit agent result migration");
      if (committed.data) result.migrated++; else result.conflicted++;
    } catch { result.failed++; }
  }
  return result;
}
