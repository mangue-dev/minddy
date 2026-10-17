import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "./encryption/content-config";
import { getEncryptedStore } from "./encryption/registry";
import { EncryptedRowCodec, type StoredRow } from "./encryption/row-codec";
import { parseStoredEmbedding } from "./embeddings";
import { dequantizeVector, isCompactVector, quantizeVector } from "./issue-vector-format";

/**
 * Repository of the issue embedding index (MIN-717).
 *
 * A vector computed from an issue's title and description is derived private
 * data: it lives under the same project content key as the issue, encoded
 * together with the fingerprint of the content it was computed from. Only the
 * routing columns stay clear — issue, project, index version, the random
 * content version and the dimension count — so the index can be filtered by
 * version without reading any content, and similarity is computed in the
 * server after decryption, like feedback search. No plaintext vector index
 * exists in Postgres.
 *
 * The encryption rule follows the issue's: a project with content encryption
 * on, or with an issue encryption scope, gets encrypted vectors. A row written
 * in clear before its project switched is re-encoded by the index backfill
 * (`rewriteStoredEmbedding`), which costs no AI call because the vector is
 * already known. Vectors are stored compactly as int8 (`issue-vector-format.ts`);
 * the legacy float arrays are still read and rewritten by the same walk. If the key cannot be loaded the write fails and no vector is
 * stored: a missing vector only costs the lexical fallback, while a clear copy
 * of encrypted content would break the data boundary.
 */

type Row = Record<string, unknown>;

export interface IssueEmbeddingRow {
  issue_id: string;
  project_id: string;
  index_version: string;
  content_version: string;
  dimensions: number;
  embedding: number[];
  content_hash: string;
  /** The stored row was in clear when read (decoding only; never written). */
  stored_clear?: boolean;
  /** The stored vector was a legacy JSON float array (decoding only). */
  stored_legacy_format?: boolean;
  /** The row's `encryption_version` when read, for compare-and-swap rewrites. */
  stored_encryption_version?: number;
}

const SELECT_COLUMNS =
  "issue_id, project_id, index_version, content_version, dimensions, embedding, content_hash, encrypted_content, encryption_version";

/** Whether this project's issue content is encrypted, hence its vectors must be. */
export async function projectEncrypts(projectId: string): Promise<boolean> {
  if (isContentEncryptionEnabled()) return true;
  // Unlike `encodeIssue`, no shortcut on the root key: an issue already
  // encrypted in this project means its vectors must be, whatever the flags.
  const { data, error } = await getServiceClient()
    .from("issue_encryption_scopes")
    .select("project_id")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve issue encryption state");
  }
  return !!data;
}

/** The stored vector, in either format: compact int8 (current) or a legacy float array. */
function readVector(value: unknown): { vector: number[]; legacy: boolean } | null {
  if (isCompactVector(value)) return { vector: dequantizeVector(value), legacy: false };
  const legacy = parseStoredEmbedding(value);
  return legacy ? { vector: legacy, legacy: true } : null;
}

function validate(row: Row): IssueEmbeddingRow {
  const read = readVector(row.embedding);
  const embedding = read?.vector;
  if (
    typeof row.issue_id !== "string" ||
    typeof row.project_id !== "string" ||
    typeof row.index_version !== "string" ||
    typeof row.content_version !== "string" ||
    typeof row.content_hash !== "string" ||
    typeof row.dimensions !== "number" ||
    !embedding ||
    embedding.length !== row.dimensions
  ) {
    throw new Error("Invalid issue embedding");
  }
  return {
    issue_id: row.issue_id,
    project_id: row.project_id,
    index_version: row.index_version,
    content_version: row.content_version,
    dimensions: row.dimensions,
    embedding,
    content_hash: row.content_hash,
    ...(read?.legacy ? { stored_legacy_format: true } : {}),
  };
}

/** The in-memory row checked before encoding: a float vector of the declared size. */
function validateForWrite(row: IssueEmbeddingRow): void {
  if (
    !Array.isArray(row.embedding) ||
    row.embedding.length !== row.dimensions ||
    !row.embedding.every((value) => typeof value === "number" && Number.isFinite(value))
  ) {
    throw new Error("Invalid issue embedding");
  }
}

/** Decode one stored row. The caller has already scoped the read to a project it serves. */
export async function decodeIssueEmbedding(row: Row): Promise<IssueEmbeddingRow> {
  const { encryption_version, encrypted_content, ...plain } = row;
  if (encryption_version === undefined && encrypted_content === undefined ||
      encryption_version === 0 && encrypted_content === null) {
    return { ...validate(plain), stored_clear: true, stored_encryption_version: 0 };
  }
  if (typeof row.project_id !== "string") throw new Error("Missing issue embedding project");
  const decoded = await new EncryptedRowCodec(getEncryptedStore()).decode(row as StoredRow,
    { table: "issue_embeddings", scope: { kind: "project", id: row.project_id } },
    { actorId: null, reason: "repository_read" });
  return {
    ...validate(decoded),
    stored_encryption_version: typeof encryption_version === "number" ? encryption_version : undefined,
  };
}

/** Encode a complete row for insert or upsert. */
export async function encodeIssueEmbedding(row: IssueEmbeddingRow): Promise<Row> {
  validateForWrite(row);
  const {
    stored_clear: _clear,
    stored_legacy_format: _legacy,
    stored_encryption_version: _version,
    ...columns
  } = row;
  const stored: Row = {
    ...columns,
    // Always written compactly; the legacy float array is only ever read.
    embedding: quantizeVector(row.embedding),
    updated_at: new Date().toISOString(),
  };
  if (!(await projectEncrypts(row.project_id))) {
    return { ...stored, encryption_version: 0, encrypted_content: null };
  }
  return new EncryptedRowCodec(getEncryptedStore()).encode(
    { ...stored, encryption_version: 0, encrypted_content: null },
    { table: "issue_embeddings", scope: { kind: "project", id: row.project_id } },
  );
}

/**
 * Write the vector of an issue for one index version, then remove the
 * issue's rows in `staleVersions`: the other embedding spaces whose stored
 * fingerprint no longer matches the content. A version computed from the
 * SAME content is kept — another account (BYOK on another provider) still
 * queries it, and deleting it would only make that account pay to recreate it.
 */
export async function writeIssueEmbedding(
  service: SupabaseClient,
  row: IssueEmbeddingRow,
  staleVersions: string[] = [],
): Promise<void> {
  const stored = await encodeIssueEmbedding(row);
  const { error } = await service
    .from("issue_embeddings")
    .upsert(stored, { onConflict: "issue_id,index_version" });
  if (error) throw new Error("Unable to write issue embedding");
  const versions = staleVersions.filter((version) => version !== row.index_version);
  if (versions.length > 0) {
    const { error: purgeError } = await service
      .from("issue_embeddings")
      .delete()
      .eq("issue_id", row.issue_id)
      .in("index_version", versions);
    if (purgeError) console.error("[issue-index] stale version purge failed");
  }
}

/** Remove the issue's rows in these versions (content changed, no new vector written). */
export async function deleteIssueEmbeddingVersions(
  service: SupabaseClient,
  issueId: string,
  versions: string[],
): Promise<void> {
  if (versions.length === 0) return;
  const { error } = await service
    .from("issue_embeddings")
    .delete()
    .eq("issue_id", issueId)
    .in("index_version", versions);
  if (error) console.error("[issue-index] stale version purge failed");
}

/**
 * Whether a stored row should be rewritten in place: a legacy float array
 * (compact format since the follow-up of MIN-718), or a clear row of a
 * project that now encrypts. Neither needs an AI call.
 */
export async function needsRewrite(row: IssueEmbeddingRow): Promise<boolean> {
  if (row.stored_legacy_format) return true;
  return !!row.stored_clear && (await projectEncrypts(row.project_id));
}

/**
 * Rewrite a stored row in place — compact format, and encrypted when its
 * project encrypts — from the vector already decoded. Compare-and-swap on the
 * content version and the encryption version read, so a concurrent rewrite
 * always wins. Returns whether the row was rewritten.
 */
export async function rewriteStoredEmbedding(
  service: SupabaseClient,
  row: IssueEmbeddingRow,
): Promise<boolean> {
  if (row.stored_encryption_version === undefined || !(await needsRewrite(row))) return false;
  const stored = await encodeIssueEmbedding(row);
  const { data, error } = await service
    .from("issue_embeddings")
    .update({
      embedding: stored.embedding,
      content_hash: stored.content_hash,
      encrypted_content: stored.encrypted_content,
      encryption_version: stored.encryption_version,
      updated_at: stored.updated_at,
    })
    .eq("issue_id", row.issue_id)
    .eq("index_version", row.index_version)
    .eq("content_version", row.content_version)
    .eq("encryption_version", row.stored_encryption_version)
    .select("issue_id");
  if (error) {
    console.error("[issue-index] rewrite failed");
    return false;
  }
  return (data ?? []).length > 0;
}

/**
 * Every decodable row of these issues, all versions. Used by indexing to find
 * the issue's row in the payer's embedding space before paying for a new one.
 */
export async function listIssueEmbeddings(
  service: SupabaseClient,
  issueIds: string[],
): Promise<IssueEmbeddingRow[]> {
  if (issueIds.length === 0) return [];
  const { data, error } = await service
    .from("issue_embeddings")
    .select(SELECT_COLUMNS)
    .in("issue_id", issueIds);
  if (error) throw new Error("Unable to read issue embeddings");
  const rows: IssueEmbeddingRow[] = [];
  for (const row of data ?? []) {
    try {
      rows.push(await decodeIssueEmbedding(row as Row));
    } catch {
      // Left to the encryption maintenance; the issue is simply re-embedded.
    }
  }
  return rows;
}

/**
 * The rows of one index version in a project, decoded in pages of 200, most
 * recently written first and at most `maxRows` (larger projects are searched
 * on their most recent vectors; the rest stay reachable by text).
 * Rows that fail to decode are skipped (a key rotation in progress must not
 * break retrieval); only the same version is ever returned, so two embedding
 * spaces are never compared.
 */
export async function listProjectEmbeddings(
  service: SupabaseClient,
  projectId: string,
  indexVersion: string,
  maxRows = 5_000,
): Promise<IssueEmbeddingRow[]> {
  const rows: IssueEmbeddingRow[] = [];
  const pageSize = 200;
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await service
      .from("issue_embeddings")
      .select(SELECT_COLUMNS)
      .eq("project_id", projectId)
      .eq("index_version", indexVersion)
      // Past `maxRows`, the most recently (re)indexed issues are the ones
      // kept: an issue someone touches is the one being looked for. The id
      // keeps the page boundaries stable.
      .order("updated_at", { ascending: false })
      .order("issue_id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error("Unable to list issue embeddings");
    for (const row of data ?? []) {
      try {
        rows.push(await decodeIssueEmbedding(row as Row));
      } catch {
        // An undecodable row is left to the encryption maintenance.
      }
    }
    if ((data ?? []).length < pageSize) break;
  }
  return rows;
}
