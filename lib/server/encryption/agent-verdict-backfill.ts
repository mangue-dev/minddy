import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeAgentVerdict, encodeAgentVerdict,
  type StoredAgentVerdict } from "@/lib/server/agent/run-verdict-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys, getEncryptedStore } from "./registry";

type VerdictRow = StoredAgentVerdict & {
  verdict_ciphertext: string | null;
  verdict_encryption_version: number;
};

/** Convert and rotate a bounded verdict batch under compare-and-swap. */
export async function backfillAgentVerdictsBatch(limit = 20, signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_AGENT_VERDICT_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Agent verdict encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid agent verdict batch size");
  }
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("agent_runs")
    .select("id,project_id,verdict,verdict_ciphertext,verdict_encryption_version")
    .or("verdict.not.is.null,verdict_ciphertext.not.is.null")
    .order("verdict_encryption_checked_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan agent verdicts");
  for (const row of (data ?? []) as VerdictRow[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      if (!row.id || !row.project_id || !Number.isSafeInteger(row.verdict_encryption_version) ||
          row.verdict_encryption_version < 0) throw new Error("Invalid agent verdict scope");
      const identity = { p_id: row.id, p_project_id: row.project_id,
        p_old_verdict: row.verdict, p_old_cipher: row.verdict_ciphertext,
        p_old_version: row.verdict_encryption_version };
      const decoded = await decodeAgentVerdict(row);
      if (!decoded.verdict) throw new Error("Missing agent verdict");
      const key = await getContentKeys().current({ kind: "project", id: row.project_id });
      const version = key.version;
      key.bytes.fill(0);
      if (row.verdict_encryption_version === version && row.verdict_ciphertext &&
          getEncryptedStore().formatOf(getEncryptedStore().fromDatabase(row.verdict_ciphertext)) === 3) {
        const checked = await service.rpc("migrate_agent_run_verdict", identity);
        if (checked.error) throw new Error("Unable to mark agent verdict attempt");
        if (checked.data) result.unchanged++; else result.conflicted++;
        continue;
      }
      const replacement = await encodeAgentVerdict(row.project_id, row.id, decoded.verdict);
      const verified = await decodeAgentVerdict({ ...row, ...replacement });
      if (JSON.stringify(verified.verdict) !== JSON.stringify(decoded.verdict)) {
        throw new Error("Agent verdict migration verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const committed = await service.rpc("migrate_agent_run_verdict", {
        ...identity, p_cipher: replacement.verdict_ciphertext,
        p_version: replacement.verdict_encryption_version,
      });
      if (committed.error) throw new Error("Unable to commit agent verdict migration");
      if (committed.data) result.migrated++; else result.conflicted++;
    } catch {
      result.failed++;
    }
  }
  return result;
}
