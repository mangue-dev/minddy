import "server-only";

import { isDeepStrictEqual } from "node:util";
import { getServiceClient } from "@/lib/supabase-service";
import { recordBackfillAttempt } from "./backfill-attempt";
import { decodeProject, encodeProject, projectContentValues } from
  "@/lib/server/project-content";
import { getContentKeys, getEncryptedStore } from "./registry";
import { isContentEncryptionEnabled } from "./content-config";

/** Convert complete project content under a bounded revision-guarded scan. */
export async function backfillProjectContentBatch(limit = 30,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_PROJECT_CONTENT_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Project content encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid project content batch size");
  }
  const service = getServiceClient();
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const { data, error } = await service.from("projects").select("*")
    .order("encryption_attempted_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan project content");
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      if (!await recordBackfillAttempt(service, "projects",
        "encryption_attempted_at", { id: row.id, content_revision: row.content_revision, encrypted_content: row.encrypted_content, encryption_version: row.encryption_version })) {
        result.conflicted++;
        continue;
      }
      const revision = Number(row.content_revision);
      if (!Number.isSafeInteger(revision) || revision < 0) {
        throw new Error("Invalid project revision");
      }
      const scope = { kind: "project" as const, id: row.id as string };
      if (!scope.id) throw new Error("Missing project identity");
      const plain = await decodeProject(row);
      const current = await getContentKeys().current(scope);
      const currentVersion = current.version;
      current.bytes.fill(0);
      const store = getEncryptedStore();
      const fresh = row.encryption_version === currentVersion &&
        typeof row.encrypted_content === "string" &&
        store.formatOf(store.fromDatabase(row.encrypted_content)) === 3;
      const encoded = fresh ? row : await encodeProject({ ...plain,
        encryption_version: row.encryption_version }, { force: true });
      const verified = fresh ? plain : await decodeProject(encoded);
      const fields = (value: Record<string, unknown>) => ({
        name: value.name, automations: value.automations,
        smart_assign_rules: value.smart_assign_rules });
      if (!isDeepStrictEqual(fields(plain), fields(verified))) {
        throw new Error("Project migration mismatch");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const write = await service.from("projects")
        .update(fresh
          ? { encryption_checked_at: new Date().toISOString() }
          : { ...projectContentValues(encoded),
            encryption_checked_at: new Date().toISOString() })
        .eq("id", row.id).eq("owner_id", row.owner_id)
        .eq("content_revision", revision).select("id").maybeSingle();
      if (write.error) throw new Error("Unable to migrate project content");
      if (!write.data) result.conflicted++;
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch { result.failed++; }
  }
  return result;
}
