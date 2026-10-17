import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { EncryptedRowCodec, type StoredRow } from "./encryption/row-codec";
import { getEncryptedStore } from "./encryption/registry";
import type { Encrypted } from "./encryption/store";
import type { PageWriteKind } from "@/lib/pages";
import type { CollabField, CollabJournalBatch } from "@/lib/page-collaboration";

/**
 * The OPERATION AUTHORITY's storage layer (MIN-688): the step journal and the
 * one RPC that commits a batch.
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

/** The stream columns read alongside a page. */
export const COLLAB_COLUMNS = "body_revision, title_revision";

/** Journal rows read per catch-up query: 2,000 steps fit in far fewer. */
const JOURNAL_ROWS_PER_READ = 200;

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

export type CommitOutcome =
  | { status: "accepted"; bodyRevision: number; titleRevision: number }
  | { status: "duplicate"; bodyRevision: number; titleRevision: number }
  | { status: "behind"; field: CollabField; head: number }
  | { status: "retry" }
  | { status: "batch_reused" }
  | { status: "missing" };

/**
 * Commits batches and the page columns they produce, atomically
 * (`commit_page_collaboration`). `values` are the page's new columns as the
 * caller encoded them: plaintext fields on a legacy page, the re-sealed
 * envelope on a protected one. `protect` says which form the journal takes,
 * and must match the page as it will be after this write.
 */
export async function commitCollaboration(service: Service, {
  pageId,
  projectId,
  contentRevision,
  values,
  batches,
  protect,
  sealed: presealed,
}: {
  pageId: string;
  projectId: string;
  contentRevision: number;
  values: Record<string, unknown>;
  batches: CollabBatchInput[];
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
  });
  if (error) throw new CollabCommitError(error.code, error.message);
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
      return { status: result.status };
    default:
      throw new Error("commit_page_collaboration returned an unknown status");
  }
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

/** Opens a gap on both streams after a write that recorded no steps. */
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

/** Journal rows from `since`, still sealed. Nothing is decrypted here. */
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
  const { data, error } = await service
    .from("page_collaboration_batches")
    .select("page_id, project_id, field, base_revision, step_count, client_id, steps, encrypted_content, encryption_version")
    .eq("page_id", pageId)
    .eq("project_id", projectId)
    .eq("field", field)
    .gte("base_revision", since)
    .order("base_revision", { ascending: true })
    .limit(JOURNAL_ROWS_PER_READ);
  if (error) throw new Error(`page collaboration journal read failed: ${error.message}`);
  return data ?? [];
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
  actorId: string
): Promise<CollabJournalBatch[]> {
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
    };
  }));
}

/** `fetchCollaborationJournal` then `decodeCollaborationJournal`. */
export async function readCollaborationJournal(service: Service, input: {
  pageId: string;
  projectId: string;
  field: CollabField;
  since: number;
  actorId: string;
}): Promise<CollabJournalBatch[]> {
  return decodeCollaborationJournal(
    await fetchCollaborationJournal(service, input), input.projectId, input.actorId);
}
