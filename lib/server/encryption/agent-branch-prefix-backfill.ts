import "server-only";

import { markAgentBackfillAttempt } from "./agent-backfill-attempt";
import { getServiceClient } from "@/lib/supabase-service";
import { agentBranchPrefixVersion, decodeAgentBranchPrefix,
  encodeAgentBranchPrefix } from "@/lib/server/agent/branch-prefix-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";

export async function backfillAgentBranchPrefixesBatch(
  limit = 25, signal?: AbortSignal,
) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_AGENT_BRANCH_PREFIX_ENCRYPTION_ENABLED !== "true")
    throw new Error("Agent branch prefix encryption is not enabled");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Invalid agent branch prefix batch size");
  const result = { scanned: 0, migrated: 0, unchanged: 0,
    conflicted: 0, failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("user_agent_preferences")
    .select("user_id,branch_prefix,branch_prefix_encryption_checked_at")
    .order("branch_prefix_encryption_attempted_at",
      { ascending: true, nullsFirst: true })
    .order("user_id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan agent branch prefixes");
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      if (!await markAgentBackfillAttempt(service, "user_agent_preferences",
        "branch_prefix_encryption_checked_at", row as Record<string, unknown>,
        "user_id")) {
        result.conflicted++;
        continue;
      }
      const scope = {kind:"user" as const,id:row.user_id};
      const key = await getContentKeys().current(scope);
      const currentVersion = key.version;
      key.bytes.fill(0);
      const plain = await decodeAgentBranchPrefix(row.user_id,row.branch_prefix);
      const fresh = agentBranchPrefixVersion(row.branch_prefix) === currentVersion;
      const cipher = fresh ? row.branch_prefix
        : await encodeAgentBranchPrefix(row.user_id,plain);
      if (await decodeAgentBranchPrefix(row.user_id,cipher) !== plain)
        throw new Error("Agent branch prefix migration mismatch");
      if (signal?.aborted) { result.interrupted = true; break; }
      const now = new Date().toISOString();
      const { data: saved, error: writeError } = await service
        .from("user_agent_preferences")
        .update({branch_prefix:cipher,
          branch_prefix_encryption_checked_at:now,
          branch_prefix_encryption_attempted_at:now})
        .eq("user_id",row.user_id).eq("branch_prefix",row.branch_prefix)
        .select("user_id").maybeSingle();
      if (writeError) throw new Error("Unable to migrate agent branch prefix");
      if (!saved) result.conflicted++;
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch { result.failed++; }
  }
  return result;
}
