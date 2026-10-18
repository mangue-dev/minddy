import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, createHmac, hkdfSync } from "node:crypto";
import type { JSONContent } from "@tiptap/core";
import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "./encryption/content-config";
import { getEncryptedStore } from "./encryption/registry";
import { EncryptedRowCodec, type StoredRow } from "./encryption/row-codec";
import { readPageContent } from "./page-content-input";
import { documentToMarkdownServer } from "./pages-projection";

/**
 * The ProseMirror documents of the rich text surfaces outside pages (MIN-728):
 * issue and objective descriptions, issue plans and the notebook. Comments use
 * the same editor but are rendered from their Markdown, so they keep none.
 *
 * The parent keeps its Markdown, which stays what every external reader sees.
 * The document here is the editor's richer form of the same text, valid only
 * while its projection equals that Markdown (see
 * supabase/migrations/20270109200062_rich_documents.sql and
 * lib/rich-document.ts). This module never decides access: callers authorize
 * the parent with the requester's own client first.
 */

export type RichDocumentKind = "issue" | "objective" | "plan" | "notebook";

const OWNER_COLUMN: Record<RichDocumentKind, string> = {
  issue: "issue_id",
  objective: "objective_id",
  plan: "issue_id",
  notebook: "user_id",
};

/**
 * The row id of a document. A description and the notebook use their
 * parent's id; an issue's plan is a second document of the same issue, so its
 * id is derived from the issue's (a name-based UUID, version 8): stable, so
 * every instance finds the same row, and never equal to an issue id.
 */
export function documentIdOf(owner: { kind: RichDocumentKind; id: string }): string {
  if (owner.kind !== "plan") return owner.id;
  const bytes = createHash("sha256").update("minddy:issue-plan-document:").update(owner.id)
    .digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The parent a document belongs to, as its route already resolved it. */
export interface RichDocumentOwner {
  kind: RichDocumentKind;
  /** The parent's id: the issue (description or plan), the objective, or the
   notebook's user. */
  id: string;
  /** The parent's project; absent for the notebook. */
  projectId: string | null;
  /** The parent row's `encryption_version` as just read or written; read
   from the parent when the caller does not have it. */
  parentEncryptionVersion?: number;
}

/** The `ApiErrors` key of each refusal of a submitted document. */
export const DOCUMENT_ERROR_KEY = {
  "too-large": "documentTooLarge",
  "too-deep": "documentTooDeep",
  refused: "documentRefused",
} as const;

type Row = Record<string, unknown>;

function scopeOf(owner: RichDocumentOwner) {
  if (owner.kind === "notebook") return { kind: "user" as const, id: owner.id };
  if (!owner.projectId) throw new Error("A project document needs its project");
  return { kind: "project" as const, id: owner.projectId };
}

/** What the request carried, once checked, or why it was refused. */
export type RichDocumentInput =
  | { ok: true; content: JSONContent; markdown: string }
  | { ok: false; reason: "too-large" | "too-deep" | "refused" };

/** Blocks that belong to the page tree and never to these surfaces. */
const PAGE_ONLY_NODES = new Set(["subpage"]);

function usesPageOnlyNodes(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const { type, content } = node as { type?: unknown; content?: unknown };
  if (typeof type === "string" && PAGE_ONLY_NODES.has(type)) return true;
  return Array.isArray(content) && content.some(usesPageOnlyNodes);
}

/**
 * Check a submitted document against the editor schema and limits, then
 * compute its Markdown here: the server never trusts a projection sent by the
 * client, since that Markdown is what agents, the forge and notifications read.
 */
export async function readRichDocumentInput(
  value: unknown,
  profile: "document" | "notebook" = "document"
): Promise<RichDocumentInput> {
  const checked = readPageContent(value);
  if (checked === undefined || checked === "refused") return { ok: false, reason: "refused" };
  if (checked === "too-large" || checked === "too-deep") return { ok: false, reason: checked };
  if (usesPageOnlyNodes(checked)) return { ok: false, reason: "refused" };
  const content = checked as JSONContent;
  return { ok: true, content, markdown: await documentToMarkdownServer(content, profile) };
}

/**
 * Take a route's document field out of its input (MIN-728): check it, and set
 * the Markdown field to its projection. The Markdown is refused when it would
 * exceed what the parent stores, since a silently truncated text would no
 * longer be what the document says. Without a document the input is left as
 * the client sent it, Markdown included.
 */
export async function takeRichDocumentInput(
  input: Record<string, unknown>,
  fields: { document: string; markdown: string; maxLength: number },
  profile: "document" | "notebook" = "document"
): Promise<
  | { ok: true; content: JSONContent | null }
  | { ok: false; errorKey: (typeof DOCUMENT_ERROR_KEY)[keyof typeof DOCUMENT_ERROR_KEY] }
> {
  const value = input[fields.document];
  delete input[fields.document];
  if (value === undefined || value === null) return { ok: true, content: null };
  const read = await readRichDocumentInput(value, profile);
  if (!read.ok) return { ok: false, errorKey: DOCUMENT_ERROR_KEY[read.reason] };
  if (read.markdown.length > fields.maxLength) {
    return { ok: false, errorKey: DOCUMENT_ERROR_KEY["too-large"] };
  }
  input[fields.markdown] = read.markdown;
  return { ok: true, content: read.content };
}

async function shouldEncryptFor(owner: RichDocumentOwner, service: SupabaseClient): Promise<boolean> {
  if (isContentEncryptionEnabled()) return true;
  if (owner.parentEncryptionVersion !== undefined) return owner.parentEncryptionVersion > 0;
  const { data, error } = owner.kind === "issue" || owner.kind === "plan"
    ? await service.from("issues").select("encryption_version").eq("id", owner.id).maybeSingle()
    : owner.kind === "objective"
      ? await service.from("objectives").select("encryption_version").eq("id", owner.id).maybeSingle()
      : await service.from("user_scratchpad").select("encryption_version").eq("user_id", owner.id).maybeSingle();
  if (error || !data) throw new Error("Unable to resolve the document's parent");
  return Number((data as Row).encryption_version) > 0;
}

/** Store the document of `owner`, replacing any previous one. */
export async function writeRichDocument(
  owner: RichDocumentOwner,
  content: JSONContent,
  service: SupabaseClient = getServiceClient()
): Promise<void> {
  const scope = scopeOf(owner);
  const row: Row = {
    id: documentIdOf(owner),
    kind: owner.kind,
    [OWNER_COLUMN[owner.kind]]: owner.id,
    // The trigger derives it from the parent; it is written so the envelope is
    // bound to the same scope the database will hold.
    project_id: owner.kind === "notebook" ? null : owner.projectId,
    content,
    encryption_version: 0,
    encrypted_content: null,
  };
  const stored = await shouldEncryptFor(owner, service)
    ? await new EncryptedRowCodec(getEncryptedStore()).encode(row as StoredRow,
        { table: "rich_documents", scope })
    : row;
  const { error } = await service.from("rich_documents").upsert(stored, { onConflict: "id" });
  if (error) throw new Error("Unable to save the document");
}

/**
 * The stored document of `owner`, or `null` when there is none or it cannot
 * be used. A document that cannot be decoded is not an error for the reader:
 * the surface falls back to the Markdown, which is always there.
 */
export async function readRichDocument(
  owner: Omit<RichDocumentOwner, "parentEncryptionVersion">,
  actorId: string | null,
  service: SupabaseClient = getServiceClient()
): Promise<JSONContent | null> {
  const { data, error } = await service.from("rich_documents")
    .select("id, kind, issue_id, objective_id, user_id, project_id, content, encrypted_content, encryption_version")
    .eq("id", documentIdOf(owner)).eq("kind", owner.kind).maybeSingle();
  if (error) throw new Error("Unable to read the document");
  if (!data) return null;
  const row = data as Row;
  if (owner.kind !== "notebook" && row.project_id !== owner.projectId) return null;
  try {
    const decoded = row.encryption_version === 0
      ? row
      : await new EncryptedRowCodec(getEncryptedStore()).decode(row as StoredRow,
          { table: "rich_documents", scope: scopeOf(owner) },
          { actorId, reason: "repository_read" });
    const content = decoded.content;
    return content && typeof content === "object" && !Array.isArray(content)
      ? content as JSONContent
      : null;
  } catch (error) {
    console.error("[rich-documents] unreadable document", (error as Error).message);
    return null;
  }
}

/** Delete clear documents whose parent has been encrypted since (maintenance). */
export async function purgeClearRichDocuments(limit = 200): Promise<{ removed: number }> {
  const { data, error } = await getServiceClient().rpc("purge_clear_rich_documents", { p_limit: limit });
  if (error) throw new Error("Unable to purge clear documents");
  return { removed: typeof data === "number" ? data : 0 };
}

/* ── Live descriptions (MIN-728, migration 20270109200063) ──────────────── */

/** The project-owned documents that are step streams: descriptions and plans. */
export type DescriptionKind = Exclude<RichDocumentKind, "notebook">;

let fingerprintKey: { source: string; key: Buffer } | null = null;

/**
 * A keyed fingerprint of a description's Markdown, bound to its document. It
 * only tells whether the parent's Markdown is still the one last materialized;
 * keyed, so the stored value cannot confirm a guessed description. A changed
 * server secret only makes the next read fold an identical Markdown back in,
 * which changes nothing.
 */
export function markdownFingerprint(documentId: string, markdown: string): string {
  const root = process.env.MINDDY_DATA_ROOT_KEY;
  const source = root ? `root:${root}` : `service:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`;
  if (fingerprintKey?.source !== source) {
    fingerprintKey = {
      source,
      key: Buffer.from(hkdfSync("sha256", Buffer.from(source, "utf8"),
        Buffer.from("minddy:rich-document-fingerprint:v1"), Buffer.from("markdown"), 32)),
    };
  }
  return createHmac("sha256", fingerprintKey.key)
    .update(documentId).update("\0").update(markdown.trim()).digest("hex");
}

/** A description document at its stream head. */
export interface DocumentHead {
  revision: number;
  /** The revision the parent's Markdown reflects. */
  materializedRevision: number;
  /** SHA-256 of that Markdown, or `null` before the first materialization. */
  materializedHash: string | null;
  content: JSONContent;
  encryptionVersion: number;
  projectId: string;
}

const HEAD_COLUMNS =
  "id, kind, issue_id, objective_id, user_id, project_id, content, encrypted_content, " +
  "encryption_version, revision, materialized_revision, materialized_hash";

/** The head of a description's stream, decoded, or `null` when it has none. */
export async function readDocumentHead(
  owner: { kind: DescriptionKind; id: string; projectId: string },
  actorId: string | null,
  service: SupabaseClient = getServiceClient()
): Promise<DocumentHead | null> {
  const { data, error } = await service.from("rich_documents").select(HEAD_COLUMNS)
    .eq("id", documentIdOf(owner)).eq("kind", owner.kind).maybeSingle();
  if (error) throw new Error("Unable to read the document");
  if (!data) return null;
  const row = data as unknown as Row;
  if (row.project_id !== owner.projectId) return null;
  const decoded = Number(row.encryption_version) === 0
    ? row
    : await new EncryptedRowCodec(getEncryptedStore()).decode(
        { ...row } as StoredRow,
        { table: "rich_documents", scope: scopeOf(owner) },
        { actorId, reason: "repository_read" });
  const content = decoded.content;
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    throw new Error("Invalid document content");
  }
  return {
    revision: Number(row.revision),
    materializedRevision: Number(row.materialized_revision),
    materializedHash: typeof row.materialized_hash === "string" ? row.materialized_hash : null,
    content: content as JSONContent,
    encryptionVersion: Number(row.encryption_version),
    projectId: owner.projectId,
  };
}

async function sealDocumentRow(owner: RichDocumentOwner, content: JSONContent, encrypt: boolean) {
  const row: Row = {
    id: documentIdOf(owner),
    kind: owner.kind,
    [OWNER_COLUMN[owner.kind]]: owner.id,
    project_id: owner.kind === "notebook" ? null : owner.projectId,
    content,
    encryption_version: 0,
    encrypted_content: null,
  };
  return encrypt
    ? new EncryptedRowCodec(getEncryptedStore()).encode(row as StoredRow,
        { table: "rich_documents", scope: scopeOf(owner) })
    : row;
}

/**
 * Create a description's stream at revision 0 from the document its Markdown
 * reads as, unless one exists already (a concurrent first reader). The
 * Markdown it was built from is recorded as materialized.
 */
export async function createDocumentStream(
  owner: { kind: DescriptionKind; id: string; projectId: string },
  content: JSONContent,
  markdownHash: string,
  service: SupabaseClient = getServiceClient()
): Promise<void> {
  const sealed = await sealDocumentRow(owner, content, await shouldEncryptFor(owner, service));
  const { error } = await service.from("rich_documents").upsert(
    { ...sealed, revision: 0, materialized_revision: 0, materialized_hash: markdownHash },
    { onConflict: "id", ignoreDuplicates: true }
  );
  if (error) throw new Error("Unable to create the document");
}

/** One batch for `commit_rich_document`, before sealing. */
export interface DocumentBatchInput {
  base: number;
  batchId: string;
  clientId: string;
  steps: unknown[];
  /** `null` for a presentation or a server-side reconciliation. */
  authorId: string | null;
}

export type DocumentCommitOutcome =
  | { status: "accepted" | "duplicate"; revision: number }
  | { status: "behind"; head: number }
  | { status: "missing" };

/**
 * Commit `content` as the new head, with the batch that leads to it, under
 * the revision CAS. A sealed document stays sealed and seals its batches; a
 * clear one is sealed as soon as its parent or the instance protects content.
 * `materializedHash` records that the caller also wrote the parent's Markdown
 * for this head.
 */
export async function commitDocument(
  owner: { kind: DescriptionKind; id: string; projectId: string },
  head: Pick<DocumentHead, "encryptionVersion">,
  content: JSONContent,
  batch: DocumentBatchInput,
  materializedHash: string | null = null,
  service: SupabaseClient = getServiceClient()
): Promise<DocumentCommitOutcome> {
  const encrypt = head.encryptionVersion > 0 || await shouldEncryptFor(owner, service);
  const [sealed, sealedBatch] = await Promise.all([
    sealDocumentRow(owner, content, encrypt),
    encrypt
      ? new EncryptedRowCodec(getEncryptedStore()).encode({
          document_id: documentIdOf(owner),
          base_revision: batch.base,
          project_id: owner.projectId,
          steps: batch.steps,
          encryption_version: 0,
          encrypted_content: null,
        } as StoredRow, { table: "rich_document_batches", scope: scopeOf(owner) })
      : null,
  ]);
  const { data, error } = await service.rpc("commit_rich_document", {
    p_id: documentIdOf(owner),
    p_base: batch.base,
    p_content: sealed.content ?? null,
    p_encrypted_content: sealed.encrypted_content ?? null,
    p_encryption_version: sealed.encryption_version ?? 0,
    p_batch: {
      batch_id: batch.batchId,
      client_id: batch.clientId,
      author_id: batch.authorId ?? "",
      step_count: batch.steps.length,
      ...(sealedBatch
        ? { encrypted_content: sealedBatch.encrypted_content, encryption_version: sealedBatch.encryption_version }
        : { steps: batch.steps, encryption_version: 0 }),
    },
    p_materialized_hash: materializedHash,
  });
  if (error) throw new Error(`Unable to commit the document: ${error.message}`);
  const result = (data ?? {}) as Row;
  if (result.status === "accepted" || result.status === "duplicate") {
    return { status: result.status, revision: Number(result.revision) };
  }
  if (result.status === "behind") return { status: "behind", head: Number(result.head) };
  return { status: "missing" };
}

/** The revision a batch reached, when it was already accepted (a retry). */
export async function documentBatchReceipt(
  documentId: string,
  batchId: string,
  service: SupabaseClient = getServiceClient()
): Promise<number | null> {
  const { data, error } = await service.from("rich_document_batches")
    .select("base_revision, step_count").eq("document_id", documentId).eq("batch_id", batchId)
    .maybeSingle();
  if (error) throw new Error("Unable to read the document journal");
  return data ? Number(data.base_revision) + Number(data.step_count) : null;
}

/** A journal batch, decoded. */
export interface DocumentJournalBatch {
  base: number;
  stepCount: number;
  clientId: string;
  authorId: string | null;
  steps: unknown[];
}

/** Journal rows covering revisions after `since`, decoded, in order. */
export async function readDocumentBatches(
  owner: { kind: DescriptionKind; id: string; projectId: string },
  since: number,
  actorId: string | null,
  service: SupabaseClient = getServiceClient()
): Promise<DocumentJournalBatch[]> {
  const columns = "document_id, base_revision, project_id, step_count, client_id, author_id, steps, encrypted_content, encryption_version";
  // The batches from `since` on, plus the one that may contain `since`.
  const [after, before] = await Promise.all([
    service.from("rich_document_batches").select(columns)
      .eq("document_id", documentIdOf(owner)).gte("base_revision", since)
      .order("base_revision", { ascending: true }).limit(200),
    service.from("rich_document_batches").select(columns)
      .eq("document_id", documentIdOf(owner)).lt("base_revision", since)
      .order("base_revision", { ascending: false }).limit(1),
  ]);
  if (after.error || before.error) throw new Error("Unable to read the document journal");
  const data = [...(before.data ?? []), ...(after.data ?? [])];
  const codec = new EncryptedRowCodec(getEncryptedStore());
  const batches: DocumentJournalBatch[] = [];
  for (const row of data as Row[]) {
    if (Number(row.base_revision) + Number(row.step_count) <= since) continue;
    if (row.project_id !== owner.projectId) throw new Error("Journal scope mismatch");
    const decoded = Number(row.encryption_version) === 0
      ? row
      : await codec.decode({ ...row } as StoredRow,
          { table: "rich_document_batches", scope: scopeOf(owner) },
          { actorId, reason: "repository_read" });
    batches.push({
      base: Number(row.base_revision),
      stepCount: Number(row.step_count),
      clientId: String(row.client_id),
      authorId: typeof row.author_id === "string" ? row.author_id : null,
      steps: Array.isArray(decoded.steps) ? decoded.steps : [],
    });
  }
  return batches;
}

/** The parent's Markdown now reflects `revision`. */
export async function markDocumentMaterialized(
  documentId: string,
  revision: number,
  hash: string,
  service: SupabaseClient = getServiceClient()
): Promise<void> {
  const { error } = await service.rpc("mark_rich_document_materialized", {
    p_id: documentId, p_revision: revision, p_hash: hash,
  });
  if (error) throw new Error("Unable to record the materialization");
}

/**
 * Claim the writing of a description's Markdown, so materializations of one
 * description never overlap across instances. The claim expires on its own.
 */
export async function claimDocumentMaterialization(
  documentId: string,
  service: SupabaseClient = getServiceClient()
): Promise<boolean> {
  const { data, error } = await service.rpc("claim_rich_document_materialization", {
    p_id: documentId, p_seconds: 30,
  });
  if (error) throw new Error("Unable to claim the materialization");
  return data === true;
}

export async function releaseDocumentMaterialization(
  documentId: string,
  service: SupabaseClient = getServiceClient()
): Promise<void> {
  const { error } = await service.rpc("release_rich_document_materialization", { p_id: documentId });
  if (error) console.error("[rich-documents] materialization release failed");
}

/** Descriptions and plans whose typing has waited longer than `olderThanMs` for
 their Markdown, by parent. */
export async function staleDocumentStreams(
  olderThanMs: number,
  limit: number,
  service: SupabaseClient = getServiceClient()
): Promise<Array<{ kind: DescriptionKind; id: string; projectId: string }>> {
  const { data, error } = await service.from("rich_documents")
    .select("id, kind, issue_id, objective_id, project_id")
    .lt("pending_since", new Date(Date.now() - olderThanMs).toISOString())
    .order("pending_since", { ascending: true })
    .limit(limit);
  if (error) throw new Error("Unable to list pending documents");
  return ((data ?? []) as Row[])
    .filter((row) => (row.kind === "issue" || row.kind === "objective" || row.kind === "plan") &&
      typeof row.project_id === "string")
    .map((row) => ({
      kind: row.kind as DescriptionKind,
      id: String(row.kind === "objective" ? row.objective_id : row.issue_id),
      projectId: String(row.project_id),
    }));
}

export { usesPageOnlyNodes };
