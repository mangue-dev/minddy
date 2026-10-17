import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "./encryption/content-config";
import { getEncryptedStore } from "./encryption/registry";
import { EncryptedRowCodec, type StoredRow } from "./encryption/row-codec";
import { parseStoredEmbedding } from "./embeddings";

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
 * (`reencodeClearEmbedding`), which costs no AI call because the vector is
 * already known. If the key cannot be loaded the write fails and no vector is
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

function validate(row: Row): IssueEmbeddingRow {
  const embedding = parseStoredEmbedding(row.embedding);
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
  };
}

/** Decode one stored row. The caller has already scoped the read to a project it serves. */
export async function decodeIssueEmbedding(row: Row): Promise<IssueEmbeddingRow> {
  const { encryption_version, encrypted_content, ...plain } = row;
  if (encryption_version === undefined && encrypted_content === undefined ||
      encryption_version === 0 && encrypted_content === null) {
    return { ...validate(plain), stored_clear: true };
  }
  if (typeof row.project_id !== "string") throw new Error("Missing issue embedding project");
  const decoded = await new EncryptedRowCodec(getEncryptedStore()).decode(row as StoredRow,
    { table: "issue_embeddings", scope: { kind: "project", id: row.project_id } },
    { actorId: null, reason: "repository_read" });
  return validate(decoded);
}

/** Encode a complete row for insert or upsert. */
export async function encodeIssueEmbedding(row: IssueEmbeddingRow): Promise<Row> {
  validate(row as unknown as Row);
  const { stored_clear: _clear, ...columns } = row;
  const stored: Row = {
    ...columns,
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
 * Re-encode a row stored in clear once its project encrypts. Compare-and-swap
 * on the content version and the clear state, so a concurrent rewrite always
 * wins. Returns whether the row was converted.
 */
export async function reencodeClearEmbedding(
  service: SupabaseClient,
  row: IssueEmbeddingRow,
): Promise<boolean> {
  if (!row.stored_clear || !(await projectEncrypts(row.project_id))) return false;
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
    .eq("encryption_version", 0)
    .select("issue_id");
  if (error) {
    console.error("[issue-index] re-encode failed");
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
 * Every row of one index version in a project, decoded in pages of 200.
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
