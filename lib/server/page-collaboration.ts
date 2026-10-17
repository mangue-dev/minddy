import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { EncryptedRowCodec, type StoredRow } from "./encryption/row-codec";
import { getEncryptedStore } from "./encryption/registry";
import type { Encrypted } from "./encryption/store";
import type { PageWriteKind } from "@/lib/pages";
import type { CollabField, CollabJournalBatch } from "@/lib/page-collaboration";

/**
 * The OPERATION AUTHORITY's storage layer (MIN-688): the step journal, the
 * stream heads and the RPCs that move them.
 *
 * Two kinds of commit exist. A session's typing batch is APPENDED: its sealed
 * steps are journaled and its stream head advances, without touching the page
 * row (`appendCollaboration`). The page row is rewritten once per burst by a
 * MATERIALIZATION (`materializeCollaboration`), which writes the projection of
 * the pending steps. Whole-document writers, agents and the canonical
 * initialization still COMMIT steps and projection together
 * (`commitCollaboration`).
 *
 * This module knows nothing of pages as documents — the decoded page, its
 * side effects (history, activity, search, links) and the access rules live in
 * lib/server/pages.ts, which calls down here. Keeping the dependency in that
 * direction lets every page writer, including the agent tools, route through
 * the authority without a cycle.
 *
 * Steps can carry text, including text a collaborator deleted, so a protected
 * page's batches are sealed with the page's project key, exactly like the page
 * envelope. Only a legacy plaintext page journals plaintext steps, and the
 * database guard deletes those rows the moment the page becomes sealed.
 */

type Service = SupabaseClient;

/**
 * The stream columns read alongside a page: the MATERIALIZED revisions on the
 * row (what its projection reflects) and the stream heads, embedded so one
 * statement returns a consistent pair.
 */
export const COLLAB_COLUMNS =
  "body_revision, title_revision, page_collaboration_heads(field, revision)";

/** Materialized revisions and heads of both streams, from a row read with `COLLAB_COLUMNS`. */
export interface StreamRevisions {
  materialized: Record<CollabField, number>;
  head: Record<CollabField, number>;
}

/**
 * Reads the revisions a `COLLAB_COLUMNS` row carries, and removes the embedded
 * heads so they never reach a page payload. A missing head row (a page
 * created by a writer that bypassed the insert trigger) is the materialized
 * revision: nothing pending.
 */
export function takeStreamRevisions(row: Record<string, unknown>): StreamRevisions {
  const materialized = {
    body: Number(row.body_revision ?? 0),
    title: Number(row.title_revision ?? 0),
  };
  const head = { ...materialized };
  const embedded = row.page_collaboration_heads;
  delete row.page_collaboration_heads;
  for (const entry of Array.isArray(embedded) ? embedded : []) {
    const field = (entry as { field?: unknown }).field;
    const revision = Number((entry as { revision?: unknown }).revision);
    if ((field === "body" || field === "title") && Number.isSafeInteger(revision)) {
      head[field] = Math.max(revision, materialized[field]);
    }
  }
  return { materialized, head };
}

/** Whether any accepted step is not reflected by the page row yet. */
export function hasPendingSteps(revisions: StreamRevisions): boolean {
  return revisions.head.body > revisions.materialized.body ||
    revisions.head.title > revisions.materialized.title;
}

/** Journal rows read per catch-up query: 2,000 steps fit in far fewer. */
const JOURNAL_ROWS_PER_READ = 200;

/**
 * Stored bytes per catch-up query: a batch can hold up to 400 KB, and 200 of
 * them would be 80 MB to fetch and decrypt in one request. A read returns at
 * least one row, and the client asks again from where it stopped.
 */
const JOURNAL_BYTES_PER_READ = 4 * 1024 * 1024;

/** A client ID for a server-side writer: never equal to a browser session's. */
export function serverCollabClientId(): string {
  return `srv-${crypto.randomUUID().replace(/-/g, "")}`;
}

const journalContext = (projectId: string) => ({
  table: "page_collaboration_batches" as const,
  scope: { kind: "project" as const, id: projectId },
});

/** One batch to commit, before sealing. */
export interface CollabBatchInput {
  field: CollabField;
  base: number;
  batchId: string;
  clientId: string;
  steps: unknown[];
  /** `null` for an unattributed presentation or initialization batch. */
  authorId: string | null;
  authorKind: PageWriteKind;
  authorApiKeyId: string | null;
  /** False for presentation and initialization batches: their
   *  materialization neither signs the page nor counts a body version. */
  authored: boolean;
}

async function sealBatch(
  pageId: string,
  projectId: string,
  batch: CollabBatchInput,
  protect: boolean
): Promise<Record<string, unknown>> {
  const identity = {
    page_id: pageId,
    field: batch.field,
    base_revision: batch.base,
    project_id: projectId,
  };
  const wire = {
    field: batch.field,
    base_revision: batch.base,
    step_count: batch.steps.length,
    batch_id: batch.batchId,
    client_id: batch.clientId,
    author_id: batch.authorId ?? "",
    author_kind: batch.authorKind,
    author_api_key_id: batch.authorApiKeyId ?? "",
    authored: batch.authored,
  };
  if (!protect) {
    return { ...wire, steps: batch.steps, encrypted_content: null, encryption_version: 0 };
  }
  const sealed = await new EncryptedRowCodec(getEncryptedStore()).encode({
    ...identity,
    steps: batch.steps,
    encryption_version: 0,
    encrypted_content: null,
  }, journalContext(projectId));
  return {
    ...wire,
    steps: null,
    encrypted_content: sealed.encrypted_content,
    encryption_version: sealed.encryption_version,
  };
}

/** A database refusal raised inside the commit (a check or trigger). */
export class CollabCommitError extends Error {
  constructor(readonly code: string | undefined, message: string) {
    super(message);
    this.name = "CollabCommitError";
  }
}

/**
 * The batches as `commit_page_collaboration` receives them, sealed when the
 * page is protected. Exposed so a caller can seal them WHILE it re-seals the
 * page envelope: both encryptions read the current key, and running them side
 * by side saves a database round trip per batch.
 */
export function sealCollabBatches(
  pageId: string,
  projectId: string,
  batches: readonly CollabBatchInput[],
  protect: boolean
): Promise<Record<string, unknown>[]> {
  return Promise.all(batches.map((batch) => sealBatch(pageId, projectId, batch, protect)));
}

/** A sealing write met plaintext steps not materialized yet (migration 60). */
function isPlaintextPending(error: { code?: string; message?: string }): boolean {
  return error.code === "40001" && error.message === "page_collaboration_plaintext_pending";
}

export type CommitOutcome =
  | { status: "accepted"; bodyRevision: number; titleRevision: number }
  | { status: "duplicate"; bodyRevision: number; titleRevision: number }
  | { status: "behind"; field: CollabField; head: number }
  | { status: "retry" }
  | { status: "batch_reused" }
  | { status: "missing" };

function readCommitOutcome(data: unknown, rpc: string): CommitOutcome | { status: "revoked" } {
  const result = (data ?? {}) as Record<string, unknown>;
  switch (result.status) {
    case "accepted":
    case "duplicate":
      return {
        status: result.status,
        bodyRevision: Number(result.body_revision),
        titleRevision: Number(result.title_revision),
      };
    case "behind":
      return {
        status: "behind",
        field: result.field === "title" ? "title" : "body",
        head: Number(result.head),
      };
    case "retry":
    case "batch_reused":
    case "missing":
    case "revoked":
      return { status: result.status };
    default:
      throw new Error(`${rpc} returned an unknown status`);
  }
}

/**
 * Commits batches and the page projection at the new heads, atomically
 * (`commit_page_collaboration`). `values` are the page's new columns as the
 * caller encoded them: plaintext fields on a legacy page, the re-sealed
 * envelope on a protected one. `materialized` gives, for a stream without a
 * batch here, the revision `values` reflect. `protect` says which form the
 * journal takes, and must match the page as it will be after this write.
 */
export async function commitCollaboration(service: Service, {
  pageId,
  projectId,
  contentRevision,
  values,
  batches,
  materialized,
  protect,
  sealed: presealed,
}: {
  pageId: string;
  projectId: string;
  contentRevision: number;
  values: Record<string, unknown>;
  batches: CollabBatchInput[];
  materialized: Record<CollabField, number>;
  protect: boolean;
  /** `batches` already sealed (`sealCollabBatches`) with this same `protect`. */
  sealed?: Record<string, unknown>[];
}): Promise<CommitOutcome> {
  const sealed = presealed ?? await sealCollabBatches(pageId, projectId, batches, protect);
  const { data, error } = await service.rpc("commit_page_collaboration", {
    p_page_id: pageId,
    p_expected_content_revision: contentRevision,
    p_values: values,
    p_batches: sealed,
    p_materialized: materialized,
  });
  // Plaintext typing appended since the read, on a page this write seals:
  // read again, and the next projection includes it.
  if (error && isPlaintextPending(error)) return { status: "retry" };
  if (error) throw new CollabCommitError(error.code, error.message);
  const outcome = readCommitOutcome(data, "commit_page_collaboration");
  if (outcome.status === "revoked") throw new Error("commit_page_collaboration returned revoked");
  return outcome;
}

export type AppendOutcome =
  | {
      status: "accepted";
      bodyRevision: number;
      titleRevision: number;
      /** Steps of both streams not materialized yet, this batch included. */
      pending: number;
      /** Age of the oldest of them. */
      pendingMs: number;
    }
  | Exclude<CommitOutcome, { status: "accepted" }>
  | { status: "revoked" }
  /** More than 16 MB of steps await materialization: materialize, then append. */
  | { status: "backlog" };

/**
 * Journals already sealed batches and advances their heads
 * (`append_page_collaboration`), without writing the page row. `generation`
 * is the project membership generation the caller's access decision was made
 * at; the database answers `revoked` when membership changed since.
 */
export async function appendCollaboration(service: Service, {
  pageId,
  projectId,
  generation,
  sealed,
}: {
  pageId: string;
  projectId: string;
  generation: number;
  sealed: Record<string, unknown>[];
}): Promise<AppendOutcome> {
  const { data, error } = await service.rpc("append_page_collaboration", {
    p_page_id: pageId,
    p_project_id: projectId,
    p_generation: generation,
    p_batches: sealed,
  });
  if (error) throw new CollabCommitError(error.code, error.message);
  if ((data as { status?: unknown } | null)?.status === "backlog") return { status: "backlog" };
  const outcome = readCommitOutcome(data, "append_page_collaboration");
  if (outcome.status !== "accepted") return outcome;
  const result = data as Record<string, unknown>;
  return {
    ...outcome,
    status: "accepted",
    pending: Number(result.pending ?? 0),
    pendingMs: Number(result.pending_ms ?? 0),
  };
}

export type MaterializeOutcome =
  | { status: "materialized"; pending: number }
  | { status: "unchanged" }
  | { status: "retry" }
  | { status: "missing" };

/**
 * Writes the projection of the pending steps up to `revisions`
 * (`materialize_page_collaboration`), under the envelope CAS.
 */
export async function materializeCollaboration(service: Service, {
  pageId,
  contentRevision,
  values,
  revisions,
}: {
  pageId: string;
  contentRevision: number;
  values: Record<string, unknown>;
  revisions: Record<CollabField, number>;
}): Promise<MaterializeOutcome> {
  const { data, error } = await service.rpc("materialize_page_collaboration", {
    p_page_id: pageId,
    p_expected_content_revision: contentRevision,
    p_values: values,
    p_body_revision: revisions.body,
    p_title_revision: revisions.title,
  });
  if (error && isPlaintextPending(error)) return { status: "retry" };
  if (error) throw new CollabCommitError(error.code, error.message);
  const result = (data ?? {}) as Record<string, unknown>;
  switch (result.status) {
    case "materialized":
      return { status: "materialized", pending: Number(result.pending ?? 0) };
    case "unchanged":
    case "retry":
    case "missing":
      return { status: result.status };
    default:
      throw new Error("materialize_page_collaboration returned an unknown status");
  }
}

/** Pages whose oldest pending step is older than `olderThanMs`. */
export async function listPendingCollaborations(
  service: Service,
  olderThanMs: number,
  limit: number
): Promise<string[]> {
  const { data, error } = await service.rpc("pending_page_collaborations", {
    p_older_than_ms: Math.max(0, Math.round(olderThanMs)),
    p_limit: limit,
  });
  if (error) throw new Error(`pending_page_collaborations failed: ${error.message}`);
  return Array.isArray(data) ? data.filter((id): id is string => typeof id === "string") : [];
}

/**
 * The receipt of an already accepted batch, by its ID: what a retry must find
 * BEFORE any revision comparison, since an accepted batch stays accepted after
 * later writes. Receipts live as long as the journal row (bounded retention);
 * past that, a client resolves an ambiguous send by catching up instead.
 */
export async function findCollaborationReceipt(service: Service, {
  pageId,
  projectId,
  batchId,
}: {
  pageId: string;
  projectId: string;
  batchId: string;
}): Promise<{ field: CollabField; base: number; stepCount: number } | null> {
  const { data, error } = await service
    .from("page_collaboration_batches")
    .select("field, base_revision, step_count")
    .eq("page_id", pageId)
    .eq("project_id", projectId)
    .eq("batch_id", batchId)
    .maybeSingle();
  if (error) throw new Error(`page collaboration receipt read failed: ${error.message}`);
  if (!data) return null;
  return {
    field: data.field === "title" ? "title" : "body",
    base: Number(data.base_revision),
    stepCount: Number(data.step_count),
  };
}

/** Opens a gap on both streams after a write that recorded no steps: heads
 *  jump past every accepted step, pending ones included. */
export async function resetCollaboration(service: Service, pageId: string): Promise<void> {
  const { error } = await service.rpc("reset_page_collaboration", { p_page_id: pageId });
  if (error) throw new Error(`reset_page_collaboration failed: ${error.message}`);
}

/** Deletes expired batches of idle pages; returns how many went. */
export async function pruneCollaborationJournal(service: Service, limit = 5_000): Promise<number> {
  const { data, error } = await service.rpc("prune_page_collaboration_batches", { p_limit: limit });
  if (error) throw new Error(`prune_page_collaboration_batches failed: ${error.message}`);
  return typeof data === "number" ? data : 0;
}

/** A decrypted journal row with its author, as the materializer needs it. */
export interface JournalBatch extends CollabJournalBatch {
  authorId: string | null;
  authorKind: PageWriteKind;
  authorApiKeyId: string | null;
  authored: boolean;
  createdAt: string;
}

/**
 * Journal rows from `since`, still sealed, bounded by rows and by stored bytes
 * (`read_page_collaboration_journal`). Nothing is decrypted here.
 */
export async function fetchCollaborationJournal(service: Service, {
  pageId,
  projectId,
  field,
  since,
}: {
  pageId: string;
  projectId: string;
  field: CollabField;
  since: number;
}): Promise<Record<string, unknown>[]> {
  const { data, error } = await service.rpc("read_page_collaboration_journal", {
    p_page_id: pageId,
    p_project_id: projectId,
    p_field: field,
    p_since: since,
    p_max_rows: JOURNAL_ROWS_PER_READ,
    p_max_bytes: JOURNAL_BYTES_PER_READ,
  });
  if (error) throw new Error(`page collaboration journal read failed: ${error.message}`);
  return Array.isArray(data) ? data as Record<string, unknown>[] : [];
}

/**
 * Journal rows decrypted, in revision order. The caller has established
 * access to the page's project BEFORE calling this; rows are scoped by page
 * AND project so a moved or forged identifier cannot read another project's
 * steps.
 */
export async function decodeCollaborationJournal(
  rows: readonly Record<string, unknown>[],
  projectId: string,
  /** `null` for the materializer, which reads as the system. */
  actorId: string | null
): Promise<JournalBatch[]> {
  // Built only for sealed rows: a legacy page's journal needs no key.
  let codec: EncryptedRowCodec | null = null;
  return Promise.all(rows.map(async (row) => {
    if (row.project_id !== projectId) throw new Error("Invalid page collaboration batch scope");
    let steps: unknown = row.steps;
    if (Number(row.encryption_version) > 0) {
      codec ??= new EncryptedRowCodec(getEncryptedStore());
      const decoded = await codec.decode({
        ...row,
        steps: null,
        encryption_version: Number(row.encryption_version),
        encrypted_content: row.encrypted_content as Encrypted<Record<string, unknown>>,
      } as StoredRow, journalContext(projectId), { actorId, reason: "repository_read" });
      steps = decoded.steps;
    }
    if (!Array.isArray(steps)) throw new Error("Invalid page collaboration batch");
    return {
      base: Number(row.base_revision),
      stepCount: Number(row.step_count),
      clientId: String(row.client_id),
      steps,
      authorId: typeof row.author_id === "string" ? row.author_id : null,
      authorKind: row.author_kind === "agent" ? "agent" : "human",
      authorApiKeyId: typeof row.author_api_key_id === "string" ? row.author_api_key_id : null,
      authored: row.authored !== false,
      createdAt: typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
    };
  }));
}

/** `fetchCollaborationJournal` then `decodeCollaborationJournal`. */
export async function readCollaborationJournal(service: Service, input: {
  pageId: string;
  projectId: string;
  field: CollabField;
  since: number;
  actorId: string | null;
}): Promise<JournalBatch[]> {
  return decodeCollaborationJournal(
    await fetchCollaborationJournal(service, input), input.projectId, input.actorId);
}
