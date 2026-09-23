import "server-only";

import { isContentEncryptionEnabled } from "./content-config";
import { getEncryptedStore, SupabaseKeyRegistry } from "./registry";
import { EncryptedRowCodec, type StoredRow } from "./row-codec";

export type HistoryTable = "issue_events" | "page_versions";

/** Once a project has a content key, turning off the rollout flag cannot leak new snapshots. */
export async function shouldEncryptProjectHistory(projectId: string): Promise<boolean> {
  if (isContentEncryptionEnabled()) return true;
  return (await new SupabaseKeyRegistry("content").loadCurrent({ kind: "project", id: projectId })) !== null;
}

/** Old installations need no key provider; a migrated database also rejects stale plaintext writers. */
export function canWriteLegacyHistory(): boolean {
  return !isContentEncryptionEnabled() && !process.env.MINDDY_DATA_KMS_KEY_ID;
}

function validateContent(table: HistoryTable, row: Record<string, unknown>): void {
  const nullableText = (value: unknown) => value === null || typeof value === "string";
  if (table === "issue_events") {
    if (!nullableText(row.from_value) || !nullableText(row.to_value)) throw new Error("Invalid activity content");
  } else if (typeof row.title !== "string" || !nullableText(row.icon) ||
      !row.content || typeof row.content !== "object" || Array.isArray(row.content)) {
    throw new Error("Invalid page snapshot content");
  }
}

export async function encodeHistoryRow(table: HistoryTable, row: Record<string, unknown>) {
  validateContent(table, row);
  if (typeof row.project_id !== "string" || !row.project_id) throw new Error("Missing history owner");
  if (!await shouldEncryptProjectHistory(row.project_id)) return row;
  return new EncryptedRowCodec(getEncryptedStore()).encode({
    ...row, encryption_version: 0, encrypted_content: null,
  }, { table, scope: { kind: "project", id: row.project_id } });
}

export async function decodeHistoryRow(
  table: HistoryTable, row: Record<string, unknown>, actorId: string | null,
  expectedProjectId?: string,
): Promise<Record<string, unknown>> {
  if (expectedProjectId && row.project_id !== undefined && row.project_id !== expectedProjectId) {
    throw new Error("History owner mismatch");
  }
  const { encrypted_content, encryption_version, encryption_checked_at: _checked,
    encryption_revision: _revision, ...plain } = row;
  const legacy = encryption_version === undefined && encrypted_content === undefined ||
    encryption_version === 0 && encrypted_content === null;
  if (legacy) {
    validateContent(table, plain);
    return plain;
  }
  if (typeof row.project_id !== "string" || !row.project_id) throw new Error("Missing history owner");
  const decoded = await new EncryptedRowCodec(getEncryptedStore()).decode(row as StoredRow,
    { table, scope: { kind: "project", id: row.project_id } }, { actorId, reason: "repository_read" });
  delete decoded.encryption_checked_at;
  delete decoded.encryption_revision;
  validateContent(table, decoded);
  return decoded;
}
