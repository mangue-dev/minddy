import "server-only";

import { markAgentBackfillAttempt } from "./agent-backfill-attempt";

import { isDeepStrictEqual } from "node:util";
import { getServiceClient } from "@/lib/supabase-service";
import { decodeRoutine, encodeRoutine, routineContentValues } from
  "@/lib/server/routine-content";
import { getContentKeys, getEncryptedStore } from "./registry";
import { isContentEncryptionEnabled } from "./content-config";

/** Convert complete routine instructions under a bounded revision-guarded scan. */
export async function backfillAgentRoutineContentBatch(limit = 30,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled()) {
    throw new Error("Agent routine encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid routine content batch size");
  }
  const service = getServiceClient();
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const { data, error } = await service.from("agent_routines").select("*")
    .order("encryption_attempted_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan routine content");
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      if (!await markAgentBackfillAttempt(service, "agent_routines", "encryption_checked_at",
        row as Record<string, unknown>)) {
        result.conflicted++;
        continue;
      }
      const revision = Number(row.content_revision);
      if (!Number.isSafeInteger(revision) || revision < 0) {
        throw new Error("Invalid routine revision");
      }
      const scope = { kind: "project" as const, id: row.project_id as string };
      if (!scope.id) throw new Error("Missing routine project");
      const plain = await decodeRoutine(row);
      const current = await getContentKeys().current(scope);
      const currentVersion = current.version;
      current.bytes.fill(0);
      const store = getEncryptedStore();
      const fresh = row.encryption_version === currentVersion &&
        typeof row.encrypted_content === "string" &&
        store.formatOf(store.fromDatabase(row.encrypted_content)) === 3;
      const encoded = fresh ? row : await encodeRoutine({ ...plain,
        encryption_version: row.encryption_version }, { force: true });
      const verified = fresh ? plain : await decodeRoutine(encoded);
      const fields = (value: Record<string, unknown>) => ({
        title: value.title, prompt: value.prompt,
        prompt_mentions: value.prompt_mentions, base_branch: value.base_branch });
      if (!isDeepStrictEqual(fields(plain), fields(verified))) {
        throw new Error("Routine migration mismatch");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const write = await service.from("agent_routines")
        .update(fresh
          ? { encryption_checked_at: new Date().toISOString() }
          : { ...routineContentValues(encoded),
            encryption_checked_at: new Date().toISOString() })
        .eq("id", row.id).eq("project_id", scope.id)
        .eq("content_revision", revision).select("id").maybeSingle();
      if (write.error) throw new Error("Unable to migrate routine content");
      if (!write.data) result.conflicted++;
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch { result.failed++; }
  }
  return result;
}
