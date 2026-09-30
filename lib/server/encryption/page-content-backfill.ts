import "server-only";

import { isDeepStrictEqual } from "node:util";
import { getServiceClient } from "@/lib/supabase-service";
import { recordBackfillAttempt } from "./backfill-attempt";
import { decodePage, encodePage, pageContentValues } from
  "@/lib/server/page-content";
import { getContentKeys, getEncryptedStore } from "./registry";
import { isContentEncryptionEnabled } from "./content-config";

/** Convert complete page rows under a bounded revision-guarded scan. */
export async function backfillPageContentBatch(limit = 30,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled()) {
    throw new Error("Page content encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid page content batch size");
  }
  const service = getServiceClient();
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const { data, error } = await service.from("pages").select("*")
    .order("encryption_attempted_at", { ascending: true, nullsFirst: true })
    .order("page_is_database", { ascending: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan page content");
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      if (!await recordBackfillAttempt(service, "pages",
        "encryption_attempted_at", { id: row.id, content_revision: row.content_revision, encrypted_content: row.encrypted_content, encryption_version: row.encryption_version })) {
        result.conflicted++;
        continue;
      }
      const revision = Number(row.content_revision);
      if (!Number.isSafeInteger(revision) || revision < 0) {
        throw new Error("Invalid page revision");
      }
      const scope = { kind: "project" as const, id: row.project_id as string };
      if (!scope.id) throw new Error("Missing page project");
      const plain = await decodePage(row);
      const current = await getContentKeys().current(scope);
      const currentVersion = current.version;
      current.bytes.fill(0);
      const store = getEncryptedStore();
      const fresh = row.encryption_version === currentVersion &&
        typeof row.encrypted_content === "string" &&
        store.formatOf(store.fromDatabase(row.encrypted_content)) === 3;
      const encoded = fresh ? row : await encodePage({ ...plain,
        encryption_version: row.encryption_version }, { force: true });
      const verified = fresh ? plain : await decodePage(encoded);
      const fields = (value: Record<string, unknown>) => ({
        title: value.title, icon: value.icon, content: value.content,
        database_schema: value.database_schema,
        database_title_name: value.database_title_name,
        property_values: value.property_values });
      if (!isDeepStrictEqual(fields(plain as unknown as Record<string, unknown>),
          fields(verified as unknown as Record<string, unknown>))) {
        throw new Error("Page migration mismatch");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const write = await service.rpc("migrate_verified_content_backfill", {
        p_table: "pages",
        p_expected: { id: row.id, project_id: row.project_id, content_revision: revision,
          encryption_version: row.encryption_version, encrypted_content: row.encrypted_content },
        p_values: fresh ? {} : pageContentValues(encoded),
      });
      if (write.error) throw new Error("Unable to migrate page content");
      if (!write.data) result.conflicted++;
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch { result.failed++; }
  }
  return result;
}
