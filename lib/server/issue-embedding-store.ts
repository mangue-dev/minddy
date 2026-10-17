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
 * The encryption rule is the issue's own (`encodeIssue`): a project whose
 * issues are encrypted gets encrypted vectors, and a project still in clear
 * keeps a clear row that the encryption backfill can convert later.
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
}

const SELECT_COLUMNS =
  "issue_id, project_id, index_version, content_version, dimensions, embedding, content_hash, encrypted_content, encryption_version";

async function projectEncrypts(projectId: string): Promise<boolean> {
  if (isContentEncryptionEnabled()) return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
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
    return validate(plain);
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
  const stored: Row = {
    ...row,
    embedding: row.embedding,
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

/** The row of one issue in one index version, or `null`. */
export async function readIssueEmbedding(
  service: SupabaseClient,
  issueId: string,
  indexVersion: string,
): Promise<IssueEmbeddingRow | null> {
  const { data, error } = await service
    .from("issue_embeddings")
    .select(SELECT_COLUMNS)
    .eq("issue_id", issueId)
    .eq("index_version", indexVersion)
    .maybeSingle();
  if (error) throw new Error("Unable to read issue embedding");
  return data ? decodeIssueEmbedding(data as Row) : null;
}

/**
 * Write the vector of an issue for one index version. When the content
 * changed, every OTHER version of the same issue is stale too and is removed:
 * an old embedding space may still be queried by an account on another
 * provider, and it must never answer with a vector of former content.
 */
export async function writeIssueEmbedding(
  service: SupabaseClient,
  row: IssueEmbeddingRow,
  contentChanged: boolean,
): Promise<void> {
  const stored = await encodeIssueEmbedding(row);
  const { error } = await service
    .from("issue_embeddings")
    .upsert(stored, { onConflict: "issue_id,index_version" });
  if (error) throw new Error("Unable to write issue embedding");
  if (contentChanged) {
    const { error: purgeError } = await service
      .from("issue_embeddings")
      .delete()
      .eq("issue_id", row.issue_id)
      .neq("index_version", row.index_version);
    if (purgeError) console.error("[issue-index] stale version purge failed");
  }
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
