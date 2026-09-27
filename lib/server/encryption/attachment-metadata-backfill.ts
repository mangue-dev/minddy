import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { recordBackfillAttempt } from "./backfill-attempt";
import { attachmentValueState, decodeAttachmentValue,
  encodeAttachmentValue, isEncryptedAttachmentValue,
  type AttachmentColumn, type AttachmentTable } from
  "@/lib/server/attachment-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";

const COLUMNS: Record<AttachmentTable, AttachmentColumn[]> = {
  attachments: ["file_name", "url", "icon_data_url"],
  page_files: ["file_name"],
};

type MetadataRow = {
  id: string;
  project_id: string;
  file_name: string;
  url?: string | null;
  icon_data_url?: string | null;
};

/** Rotate or convert one bounded batch of attachment or page-file metadata. */
export async function backfillAttachmentMetadataBatch(
  table: AttachmentTable, limit = 30, signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_ATTACHMENT_METADATA_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Attachment metadata encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid attachment metadata batch size");
  }
  const result = { scanned: 0, migrated: 0, unchanged: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from(table)
    .select(["id", "project_id", ...COLUMNS[table]].join(","))
    .order("content_encryption_attempted_at", { ascending: true,
      nullsFirst: true }).order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan attachment metadata");
  for (const row of (data ?? []) as unknown as MetadataRow[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      if (!await recordBackfillAttempt(service, table,
        "content_encryption_attempted_at", { id: row.id, file_name: row.file_name, ...(table === "attachments" ? { url: row.url, icon_data_url: row.icon_data_url } : {}) })) {
        result.conflicted++;
        continue;
      }
      const scope = { kind: "project" as const, id: row.project_id };
      const key = await getContentKeys().current(scope);
      const version = key.version;
      key.bytes.fill(0);
      const replacements: Record<string, string | null> = {};
      for (const column of COLUMNS[table]) {
        const value = row[column] ?? null;
        if (value === null) continue;
        const clear = await decodeAttachmentValue(table, row.project_id,
          row.id, column, value);
        if (clear === null) throw new Error("Missing attachment metadata");
        if (isEncryptedAttachmentValue(value)) {
          const state = attachmentValueState(value);
          if (state.version === version && state.format === 3) continue;
        }
        const cipher = await encodeAttachmentValue(table, row.project_id,
          row.id, column, clear);
        if (await decodeAttachmentValue(table, row.project_id,
          row.id, column, cipher) !== clear) {
          throw new Error("Attachment metadata verification failed");
        }
        replacements[column] = cipher;
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const changed = Object.keys(replacements).length > 0;
      const committed = table === "attachments"
        ? await service.rpc("migrate_attachment_metadata", {
          p_id: row.id, p_old_file_name: row.file_name, p_old_url: row.url,
          p_old_icon: row.icon_data_url,
          ...(changed ? { p_new_file_name: replacements.file_name ?? null,
            p_new_url: replacements.url ?? null,
            p_new_icon: replacements.icon_data_url ?? null } : {}),
        })
        : await service.rpc("migrate_page_file_metadata", {
          p_id: row.id, p_old_file_name: row.file_name,
          ...(changed ? { p_new_file_name: replacements.file_name ?? null } : {}),
        });
      if (committed.error) throw new Error("Unable to migrate attachment metadata");
      if (!committed.data) result.conflicted++;
      else if (changed) result.migrated++;
      else result.unchanged++;
    } catch { result.failed++; }
  }
  return result;
}
