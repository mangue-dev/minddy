import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeAgentDelegationInput, encodeAgentDelegationInput } from "@/lib/server/agent/run-delegation-content";
import type { AgentDelegationBrief } from "@/lib/server/agent/agent-contract";
import type { AttachmentInput } from "@/lib/types";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys, getEncryptedStore } from "./registry";

type DelegationRow = { id: string; project_id: string; parent_numo_turn_id: string;
  delegation_brief: AgentDelegationBrief | null; delegation_attachments: AttachmentInput[];
  encrypted_delegation_input: string | null; delegation_encryption_version: number };

/** Convert a bounded set of delegated inputs with compare-and-swap writes. */
export async function backfillAgentDelegationBatch(limit = 20, signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_AGENT_DELEGATION_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Agent delegation encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid agent delegation batch size");
  }
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("agent_runs")
    .select("id,project_id,parent_numo_turn_id,delegation_brief,delegation_attachments,encrypted_delegation_input,delegation_encryption_version")
    .not("parent_numo_turn_id", "is", null)
    .order("delegation_encryption_checked_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan agent delegation input");
  for (const row of (data ?? []) as DelegationRow[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      if (!row.id || !row.project_id || !row.parent_numo_turn_id ||
          !Number.isSafeInteger(row.delegation_encryption_version) ||
          row.delegation_encryption_version < 0) {
        throw new Error("Invalid agent delegation migration scope");
      }
      const clear = await decodeAgentDelegationInput(row);
      if (!clear.delegation_brief) throw new Error("Missing agent delegation brief");
      const key = await getContentKeys().current({ kind: "project", id: row.project_id });
      const version = key.version;
      key.bytes.fill(0);
      const cipher = row.delegation_encryption_version === version &&
        row.encrypted_delegation_input &&
        getEncryptedStore().formatOf(getEncryptedStore().fromDatabase(row.encrypted_delegation_input)) === 3
        ? row.encrypted_delegation_input
        : (await encodeAgentDelegationInput(row.project_id, row.id, {
            delegation_brief: clear.delegation_brief,
            delegation_attachments: clear.delegation_attachments,
          })).encrypted_delegation_input;
      const verified = await decodeAgentDelegationInput({ ...row, delegation_brief: null,
        delegation_attachments: [], encrypted_delegation_input: cipher,
        delegation_encryption_version: version });
      if (JSON.stringify(verified.delegation_brief) !== JSON.stringify(clear.delegation_brief) ||
          JSON.stringify(verified.delegation_attachments) !==
            JSON.stringify(clear.delegation_attachments)) {
        throw new Error("Agent delegation migration verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const committed = await service.rpc("migrate_agent_delegation_input", {
        p_id: row.id, p_project_id: row.project_id,
        p_parent_turn_id: row.parent_numo_turn_id,
        p_old_brief: row.delegation_brief,
        p_old_attachments: row.delegation_attachments,
        p_old_cipher: row.encrypted_delegation_input,
        p_old_version: row.delegation_encryption_version,
        p_cipher: cipher, p_version: version,
      });
      if (committed.error) throw new Error("Unable to commit agent delegation migration");
      if (!committed.data) result.conflicted++;
      else if (cipher === row.encrypted_delegation_input) result.unchanged++;
      else result.migrated++;
    } catch {
      result.failed++;
    }
  }
  return result;
}
