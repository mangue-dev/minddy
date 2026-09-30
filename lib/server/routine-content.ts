import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { EncryptedRowCodec, type StoredRow } from
  "./encryption/row-codec";
import { getEncryptedStore } from "./encryption/registry";
import { isContentEncryptionEnabled } from "./encryption/content-config";
import { auditDecryption } from "./encryption/audit";

type Row = Record<string, unknown>;
const ERROR_CODES = new Set(["quota","noRepo","alreadyRunning",
  "noModelForProvider","modelAbovePlan","managedServiceUnavailable",
  "executionBackendUnavailable","providerEndpointUnavailableFromSandbox",
  "launchFailed"]);

function valid(row: Row) {
  return typeof row.id === "string" && !!row.id &&
    typeof row.project_id === "string" && !!row.project_id &&
    typeof row.title === "string" && !!row.title.trim() &&
    typeof row.prompt === "string" && !!row.prompt.trim() &&
    Array.isArray(row.prompt_mentions) &&
    (row.base_branch === null || row.base_branch === undefined ||
      typeof row.base_branch === "string");
}

function owner(row: Row) {
  if (typeof row.project_id !== "string" || !row.project_id) {
    throw new Error("Routine project is required");
  }
  return { kind: "project" as const, id: row.project_id };
}

export async function shouldProtectRoutines(service?: SupabaseClient):
  Promise<boolean> {
  if (isContentEncryptionEnabled()) return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await (service ?? getServiceClient())
    .from("agent_routine_content_encryption_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code)) {
    throw new Error("Unable to resolve routine content protection state");
  }
  return !!data;
}

/** The caller must establish project membership before user-facing reads. */
export async function decodeRoutine(row: Row, actorId: string | null = null):
  Promise<Row> {
  const { encrypted_content: _cipher, encryption_version: _version,
    content_revision: _revision, encryption_checked_at: _checked,
    ...plain } = row;
  if (row.encryption_version === undefined &&
      row.encrypted_content === undefined ||
      row.encryption_version === 0 && row.encrypted_content === null) {
    if (!valid(plain)) throw new Error("Invalid legacy routine content");
    return plain;
  }
  const decoded = await new EncryptedRowCodec(getEncryptedStore()).decode(
    row as StoredRow, { table: "agent_routines", scope: owner(row) },
    { actorId, reason: "repository_read" });
  delete decoded.content_revision;
  delete decoded.encryption_checked_at;
  if (!valid(decoded) || decoded.last_error != null &&
      !ERROR_CODES.has(decoded.last_error as string)) {
    throw new Error("Invalid protected routine content");
  }
  return decoded;
}

/** Resolve just the title for an access-checked notification or tab label. */
export async function decodeRoutineTitle(row: Row,
  actorId: string | null = null): Promise<string> {
  if ((row.encryption_version === undefined || row.encryption_version === 0) &&
      row.encrypted_content == null) {
    if (typeof row.title !== "string") throw new Error("Invalid routine title");
    return row.title;
  }
  if (row.title !== null || !Number.isSafeInteger(row.encryption_version) ||
      Number(row.encryption_version) < 1 ||
      typeof row.id !== "string" || !row.id ||
      typeof row.encrypted_content !== "string") {
    throw new Error("Invalid protected routine title");
  }
  const store = getEncryptedStore();
  const context = { table: "agent_routines", scope: owner(row),
    column: "encrypted_content", rowId: JSON.stringify([row.id]) };
  const envelope = store.fromDatabase<Row>(row.encrypted_content);
  if (store.versionOf(envelope) !== row.encryption_version) {
    throw new Error("Routine title key version mismatch");
  }
  const plain = await store.decrypt(envelope, context);
  if (!plain || typeof plain.title !== "string" || !plain.title.trim()) {
    throw new Error("Invalid protected routine title");
  }
  auditDecryption(context, { actorId, reason: "repository_read" });
  return plain.title;
}

export async function encodeRoutine(row: Row,
  options: { service?: SupabaseClient; force?: boolean } = {}): Promise<Row> {
  if (!valid(row)) throw new Error("Incomplete routine content");
  const protect = options.force || Number(row.encryption_version ?? 0) > 0 ||
    await shouldProtectRoutines(options.service);
  if (!protect) return row;
  const normalized = { ...row,
    base_branch: row.base_branch ?? null,
    last_error: row.last_error == null || ERROR_CODES.has(row.last_error as string)
      ? row.last_error ?? null : "launchFailed" };
  return new EncryptedRowCodec(getEncryptedStore()).encode({
    ...normalized, encrypted_content: null, encryption_version: 0,
  } as StoredRow, { table: "agent_routines", scope: owner(row) });
}

export function routineContentValues(row: Row) {
  return { title: row.title, prompt: row.prompt,
    prompt_mentions: row.prompt_mentions, base_branch: row.base_branch,
    last_error: row.last_error,
    encrypted_content: row.encrypted_content ?? null,
    encryption_version: row.encryption_version ?? 0 };
}
