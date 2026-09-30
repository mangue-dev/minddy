import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { EncryptedRowCodec, type StoredRow } from
  "./encryption/row-codec";
import { getEncryptedStore } from "./encryption/registry";
import { isContentEncryptionEnabled } from "./encryption/content-config";
import { auditDecryption } from "./encryption/audit";

type Row = Record<string, unknown>;

function valid(row: Row) {
  return typeof row.id === "string" && !!row.id &&
    typeof row.name === "string" && !!row.name.trim() &&
    Array.isArray(row.automations) &&
    typeof row.smart_assign_rules === "object" &&
    row.smart_assign_rules !== null &&
    !Array.isArray(row.smart_assign_rules);
}

function scope(row: Row) {
  if (typeof row.id !== "string" || !row.id) {
    throw new Error("Project identity is required");
  }
  return { kind: "project" as const, id: row.id };
}

function safeIcon(row: Row) {
  return row.icon_url == null ||
    typeof row.icon_url === "string" &&
    row.icon_url.startsWith(`/api/projects/${row.id}/icon/content?v=`) &&
    /^\d+$/.test(row.icon_url.slice(
      `/api/projects/${row.id}/icon/content?v=`.length));
}

export async function shouldProtectProjects(service?: SupabaseClient):
  Promise<boolean> {
  if (isContentEncryptionEnabled()) return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await (service ?? getServiceClient())
    .from("project_content_encryption_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code)) {
    throw new Error("Unable to resolve project content protection state");
  }
  return !!data;
}

/** The caller must establish ownership, membership or a public capability. */
export async function decodeProject(row: Row, actorId: string | null = null):
  Promise<Row> {
  const { encrypted_content: _cipher, encryption_version: _version,
    content_revision: _revision, encryption_checked_at: _checked,
    ...plain } = row;
  if (row.encryption_version === undefined &&
      row.encrypted_content === undefined ||
      row.encryption_version === 0 && row.encrypted_content === null) {
    if (!valid(plain)) throw new Error("Invalid legacy project content");
    return plain;
  }
  const decoded = await new EncryptedRowCodec(getEncryptedStore()).decode(
    row as StoredRow, { table: "projects", scope: scope(row) },
    { actorId, reason: "repository_read" });
  delete decoded.content_revision;
  delete decoded.encryption_checked_at;
  if (!valid(decoded) || !safeIcon(decoded)) {
    throw new Error("Invalid protected project content");
  }
  return decoded;
}

/** Read an access-checked project name without fetching all configuration. */
export async function decodeProjectName(row: Row,
  actorId: string | null = null): Promise<string> {
  if ((row.encryption_version === undefined || row.encryption_version === 0) &&
      row.encrypted_content == null) {
    if (typeof row.name !== "string") throw new Error("Invalid project name");
    return row.name;
  }
  if (row.name !== null || !Number.isSafeInteger(row.encryption_version) ||
      Number(row.encryption_version) < 1 ||
      typeof row.encrypted_content !== "string") {
    throw new Error("Invalid protected project name");
  }
  const store = getEncryptedStore();
  const context = { table: "projects", scope: scope(row),
    column: "encrypted_content", rowId: JSON.stringify([row.id]) };
  const envelope = store.fromDatabase<Row>(row.encrypted_content);
  if (store.versionOf(envelope) !== row.encryption_version) {
    throw new Error("Project name key version mismatch");
  }
  const plain = await store.decrypt(envelope, context);
  if (!plain || typeof plain.name !== "string" || !plain.name.trim()) {
    throw new Error("Invalid protected project name");
  }
  auditDecryption(context, { actorId, reason: "repository_read" });
  return plain.name;
}

export async function encodeProject(row: Row,
  options: { service?: SupabaseClient; force?: boolean } = {}): Promise<Row> {
  if (!valid(row)) throw new Error("Incomplete project content");
  const protect = options.force || Number(row.encryption_version ?? 0) > 0 ||
    await shouldProtectProjects(options.service);
  if (!protect) return row;
  if (!safeIcon(row)) throw new Error("Project icon must be converted first");
  return new EncryptedRowCodec(getEncryptedStore()).encode({
    ...row, encrypted_content: null, encryption_version: 0,
  } as StoredRow, { table: "projects", scope: scope(row) });
}

export function projectContentValues(row: Row) {
  return { name: row.name, automations: row.automations,
    smart_assign_rules: row.smart_assign_rules,
    encrypted_content: row.encrypted_content ?? null,
    encryption_version: row.encryption_version ?? 0 };
}
