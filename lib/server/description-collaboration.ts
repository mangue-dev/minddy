import "server-only";

import type { JSONContent } from "@tiptap/core";
import { getServiceClient } from "@/lib/supabase-service";
import { afterOrNow } from "@/lib/server/after-safe";
import { hasProjectAccess } from "@/lib/server/project-access";
import { issueStore } from "@/lib/server/issue-store";
import { objectiveStore } from "@/lib/server/objective-store";
import { decodeRoutine } from "@/lib/server/routine-content";
import { promptFromMarkdown, promptToMarkdown } from "@/lib/prompt-document";
import { readPageContent } from "@/lib/server/page-content-input";
import { MAX_PLAN_LENGTH } from "@/lib/plan";
import {
  descriptionMarkdownServer,
  pageCollaborationServer,
} from "@/lib/server/pages-projection";
import {
  claimDocumentMaterialization,
  commitDocument,
  releaseDocumentMaterialization,
  createDocumentStream,
  deferDocumentMaterialization,
  documentBatchReceipt,
  documentIdOf,
  markDocumentMaterialized,
  markdownFingerprint,
  readDocumentBatches,
  readDocumentHead,
  staleDocumentStreams,
  usesPageOnlyNodes,
  type DescriptionKind,
  type DocumentHead,
} from "@/lib/server/rich-documents";
import {
  assembleCollabSteps,
  type CollabRefusal,
  type CollabSubmission,
  type CollabSubmitResult,
} from "@/lib/page-collaboration";
import {
  DESCRIPTION_COLLABORATION_PROTOCOL,
  type DescriptionCatchUp,
  type DescriptionSnapshot,
} from "@/lib/description-collaboration";

/**
 * The OPERATION AUTHORITY of live descriptions (MIN-728).
 *
 * An issue or objective description, an issue's plan, or a routine's
 * instruction (MIN-832) is a step stream like a page body
 * (docs/document-collaboration.md). Its head document lives in
 * `rich_documents`; the parent's Markdown — what every other reader uses — is
 * materialized from it a couple of seconds after typing stops.
 *
 * Every write reaches the head through this module:
 * - a session's batch is applied here, checked and committed with the new
 *   head under the revision CAS (`submitDescriptionBatch`);
 * - a writer of the parent's Markdown (a PATCH, Numo, MCP, a dictation) is
 *   expressed as steps from the head to what it wrote, reconciled block by
 *   block, and committed the same way, so live editors receive it like a
 *   collaborator's typing (`syncDescriptionWrite`);
 * - a writer that bypassed both (the forge sync) is noticed by the Markdown
 *   fingerprint and folded in the same way on the next read
 *   (`foldExternalWrite`).
 *
 * Access is decided here on every request; the document tables are
 * service-only and reached through lib/server/rich-documents.ts. Any member
 * who may write the project writes a description or a plan; only the project
 * owner writes a routine's instruction, as for every other routine field
 * (lib/server/routines.ts).
 */

export type { DescriptionKind } from "@/lib/server/rich-documents";

type Owner = { kind: DescriptionKind; id: string; projectId: string };

/** How long typing rests before its Markdown is written. */
const MATERIALIZE_QUIET_MS = 2_000;
/** The cron's threshold: pending steps older than this were never materialized. */
const STALE_PENDING_MS = 15_000;
/** Server-side commits retried after losing the CAS to concurrent typing. */
const COMMIT_ATTEMPTS = 5;
/** The same ceiling as every description write. */
const MAX_DESCRIPTION_LENGTH = 65_536;
/** The routine writer's ceiling (`MAX_PROMPT_LENGTH` of lib/server/routines.ts). */
const MAX_INSTRUCTION_LENGTH = 20_000;
/** How long an instruction rests before its routine is renamed after it. */
const RETITLE_QUIET_MS = 30_000;

export const isDescriptionKind = (value: unknown): value is DescriptionKind =>
  value === "issue" || value === "objective" || value === "plan" || value === "routine";

/**
 * The text the parent stores for the head's Markdown. A routine stores its
 * instruction with every typed mention a link without a label
 * (`promptFromMarkdown`); the other parents store the Markdown as it is.
 */
function storedText(kind: DescriptionKind, markdown: string): string {
  return kind === "routine" ? promptFromMarkdown(markdown).text : markdown;
}

/** Materializations in flight on this instance, per document. */
const keyOf = (owner: { kind: DescriptionKind; id: string }) => `${owner.kind}:${owner.id}`;

function serverClientId(): string {
  return `srv-${crypto.randomUUID().replace(/-/g, "")}`;
}

/* ── Parents ──────────────────────────────────────────────────────────────── */

interface Parent {
  projectId: string;
  /** The parent's Markdown for this document: its description, its plan, or
   its instruction. */
  description: string;
}

/** The live parent and its Markdown, read with the service client: callers
 decide access first. */
async function readParent(kind: DescriptionKind, id: string): Promise<Parent | null> {
  const service = getServiceClient();
  if (kind === "routine") {
    const { data, error } = await service.from("agent_routines").select("*")
      .eq("id", id).is("deleted_at", null).maybeSingle();
    if (error) throw new Error("Unable to read the instruction");
    if (!data || typeof data.project_id !== "string") return null;
    const routine = await decodeRoutine(data as Record<string, unknown>);
    // An instruction saved before MIN-872 keeps its "@Label" identities
    // beside the text: they read back as typed mentions.
    return {
      projectId: data.project_id,
      description: promptToMarkdown(String(routine.prompt ?? ""),
        Array.isArray(routine.prompt_mentions) ? routine.prompt_mentions : []),
    };
  }
  const column = kind === "plan" ? "plan" : "description";
  const { data, error } = kind === "objective"
    ? await objectiveStore(service).select("id, project_id, description")
        .eq("id", id).is("deleted_at", null).maybeSingle()
    : await issueStore(service).select(`id, project_id, ${column}`)
        .eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw new Error("Unable to read the description");
  const row = data as Record<string, unknown> | null;
  if (!row || typeof row.project_id !== "string") return null;
  return {
    projectId: row.project_id,
    description: typeof row[column] === "string" ? row[column] as string : "",
  };
}

export type DescriptionAccess =
  | { ok: true; owner: Owner; parent: Parent; canWrite: boolean; head: DocumentHead | null }
  | { ok: false; status: 404 | 403 };

/** Whether `actorId` may read (and write) the description. */
export async function authorizeDescription(
  kind: DescriptionKind,
  id: string,
  actorId: string,
  { write = false }: { write?: boolean } = {}
): Promise<DescriptionAccess> {
  const parent = await readParent(kind, id);
  if (!parent) return { ok: false, status: 404 };
  const owner = { kind, id, projectId: parent.projectId };
  // The head is read alongside the access decision, one round trip instead
  // of two on every snapshot and batch; it is only used once access holds.
  const [access, head] = await Promise.all([
    hasProjectAccess(actorId, parent.projectId),
    readDocumentHead(owner, actorId),
  ]);
  if (!access) return { ok: false, status: 404 };
  const canWrite = kind === "routine" ? access.isOwner : access.canWrite;
  if (write && !canWrite) return { ok: false, status: 403 };
  return { ok: true, owner, parent, canWrite, head };
}

/* ── The head ─────────────────────────────────────────────────────────────── */

/**
 * The head, created from the parent's Markdown on first use, and caught up
 * with a Markdown written outside the authority.
 */
async function ensureHead(
  owner: Owner,
  parent: Parent,
  actorId: string | null,
  known?: DocumentHead | null
): Promise<DocumentHead> {
  let head = known === undefined ? await readDocumentHead(owner, actorId) : known;
  if (!head) {
    const markdown = await descriptionMarkdownServer();
    const content = pageCollaborationServer().canonicalBodyJSON(
      markdown.fromMarkdown(parent.description)) as JSONContent;
    await createDocumentStream(owner, content, markdownFingerprint(documentIdOf(owner), parent.description));
    head = await readDocumentHead(owner, actorId);
    if (!head) throw new Error("Document stream was not created");
  }
  // A Markdown written outside the authority is folded in only while nothing
  // is pending: with typing pending, a materialization is due, and it folds
  // such a write itself under its claim (`materializeDescription`).
  if (head.revision === head.materializedRevision &&
      head.materializedHash !== markdownFingerprint(documentIdOf(owner), parent.description)) {
    head = await foldExternalWrite(owner, parent.description, actorId) ?? head;
  }
  return head;
}

/**
 * Commit `build(head)` as server-side steps, the way a second person's typing
 * is committed: the steps are computed once against the head that was read,
 * and when typing landed meanwhile they are rebased over the accepted steps
 * (`rebaseCollabSteps`), never recomputed from the new head — that would
 * revert the typing in every block the writer's text still shows as before.
 *
 * `markdownForHash` is the Markdown the writer stored in the parent. When the
 * commit includes nobody else's typing, the head IS that Markdown and is
 * recorded as materialized. After a rebase, the head also carries typing the
 * parent's Markdown does not have yet: the fingerprint is recorded so the
 * writer's Markdown is not mistaken for a foreign one, and the typing stays
 * pending for its materialization.
 */
async function commitServerEdit(
  owner: Owner,
  actorId: string | null,
  build: (head: DocumentHead) => Promise<JSONContent | null>,
  { authorId, markdownForHash }: { authorId: string | null; markdownForHash: string | null }
): Promise<DocumentHead | null> {
  const collab = pageCollaborationServer();
  const first = await readDocumentHead(owner, actorId);
  if (!first) return null;
  const target = await build(first);
  if (!target) return first;
  const hash = markdownForHash === null ? null : markdownFingerprint(documentIdOf(owner), markdownForHash);
  const ours = collab.diffCollabSteps("body", first.content,
    collab.canonicalBodyJSON(target) as JSONContent);
  if (ours.length === 0) {
    if (hash && hash !== first.materializedHash && first.materializedRevision >= first.revision) {
      await markDocumentMaterialized(documentIdOf(owner), first.revision, hash);
    }
    return first;
  }

  let head = first;
  let steps = ours;
  for (let attempt = 0; attempt < COMMIT_ATTEMPTS; attempt += 1) {
    const applied = collab.applyCollabSteps("body", head.content, steps);
    if (!applied.ok) return head;
    const rebased = head.revision !== first.revision;
    const outcome = await commitDocument(owner, head, applied.doc as JSONContent, {
      base: head.revision,
      batchId: crypto.randomUUID(),
      clientId: serverClientId(),
      steps,
      authorId,
    }, rebased ? null : hash);
    if (outcome.status === "accepted" || outcome.status === "duplicate") {
      if (rebased && hash) await markDocumentMaterialized(documentIdOf(owner), head.materializedRevision, hash);
      return { ...head, revision: outcome.revision, content: applied.doc as JSONContent };
    }
    if (outcome.status === "missing") return null;

    // Typing landed first: map our steps over everything accepted since the
    // head we computed them on.
    const latest = await readDocumentHead(owner, actorId);
    if (!latest) return null;
    const batches = await readDocumentBatches(owner, first.revision, actorId);
    const over = assembleCollabSteps("body", first.revision, latest.revision, batches,
      Number.MAX_SAFE_INTEGER);
    if ("gap" in over || over.to !== latest.revision) {
      throw new Error("The description journal cannot bridge a server edit");
    }
    steps = collab.rebaseCollabSteps("body", first.content, ours, over.steps);
    head = latest;
    if (steps.length === 0) return head;
  }
  throw new Error("The description kept moving during a server edit");
}

/**
 * The parent's Markdown was written without the authority: bring the head to
 * it, keeping every block whose Markdown it did not change.
 */
async function foldExternalWrite(owner: Owner, description: string, actorId: string | null) {
  const markdown = await descriptionMarkdownServer();
  return commitServerEdit(owner, actorId,
    async (head) => markdown.reconcile(head.content, markdown.fromMarkdown(description)),
    { authorId: null, markdownForHash: description });
}

/**
 * The head's blocks that pending typing touched take precedence over the
 * merged document: `merged` is the head reconciled with a Markdown written
 * outside the authority. The text last materialized is not kept, so a block
 * the outside writer also rewrote cannot be told from one it left as it was:
 * typing wins on every block it touched, the outside write on all others. A
 * typed block the reconciliation dropped is put back after the block that
 * preceded it.
 */
function keepTypedBlocks(head: JSONContent, merged: JSONContent, touched: ReadonlySet<string>): JSONContent {
  const idOf = (block: JSONContent | undefined) =>
    typeof block?.attrs?.blockId === "string" ? block.attrs.blockId : null;
  const headBlocks = head.content ?? [];
  const blocks = [...(merged.content ?? [])];
  headBlocks.forEach((block, index) => {
    const id = idOf(block);
    if (!id || !touched.has(id)) return;
    const at = blocks.findIndex((candidate) => idOf(candidate) === id);
    if (at >= 0) {
      blocks[at] = block;
      return;
    }
    let insertAt = 0;
    for (let previous = index - 1; previous >= 0; previous -= 1) {
      const before = idOf(headBlocks[previous]);
      const position = before ? blocks.findIndex((candidate) => idOf(candidate) === before) : -1;
      if (position >= 0) {
        insertAt = position + 1;
        break;
      }
    }
    blocks.splice(insertAt, 0, block);
  });
  return { ...merged, content: blocks };
}

/**
 * Under the materialization claim, typing is pending and the parent's
 * Markdown was written outside the authority meanwhile (the forge sync). The
 * outside write is folded into every block typing did not touch; the typed
 * blocks stay. Nothing is recorded as materialized: the caller writes the
 * merged text next.
 */
async function foldExternalWriteUnderTyping(owner: Owner, description: string) {
  const markdown = await descriptionMarkdownServer();
  const collab = pageCollaborationServer();
  return commitServerEdit(owner, null, async (head) => {
    const pending = await readPendingBatches(owner, head.materializedRevision, head.revision);
    const merged = markdown.reconcile(head.content, markdown.fromMarkdown(description));
    // Without the whole pending journal (trimmed, or cleared when the
    // document was sealed), the typed blocks are unknown: typing wins on
    // every block rather than losing any of it.
    if (!pending) return head.content;
    const touched = new Set(collab.touchedBodyBlockIds(head.content,
      pending.flatMap((batch) => batch.steps)));
    return keepTypedBlocks(head.content, merged, touched);
  }, { authorId: null, markdownForHash: null });
}

/**
 * Every batch from revision `from` to `to`, in order, or `null` when the
 * journal no longer holds them all without a gap. Read page by page: a long
 * typing burst spans more batches than one read returns.
 */
async function readPendingBatches(owner: Owner, from: number, to: number) {
  const batches: Awaited<ReturnType<typeof readDocumentBatches>> = [];
  let at = from;
  while (at < to) {
    const page = (await readDocumentBatches(owner, at, null))
      .filter((batch) => batch.base >= at)
      .sort((a, b) => a.base - b.base);
    if (page.length === 0 || page[0].base !== at) return null;
    for (const batch of page) {
      if (batch.base !== at) return null;
      batches.push(batch);
      at = batch.base + batch.stepCount;
      if (at >= to) break;
    }
  }
  return at === to ? batches : null;
}

/**
 * A writer of the parent's Markdown has just written it (MIN-728): the issue
 * and objective writers call this after their update, so connected editors
 * receive the change as steps. `content` is the editor document when the
 * writer had one (a creation dialog, a PATCH from an editor without a live
 * session); otherwise the new Markdown is reconciled with the head. Nothing
 * happens for a description that has no stream yet: its first reader builds
 * one from the Markdown.
 */
export async function syncDescriptionWrite(input: {
  kind: DescriptionKind;
  id: string;
  projectId: string;
  markdown: string;
  content?: JSONContent | null;
  authorId: string | null;
}): Promise<void> {
  const owner = { kind: input.kind, id: input.id, projectId: input.projectId };
  try {
    // The DOM-backed projection loads only for a description that has a stream.
    await commitServerEdit(owner, input.authorId,
      async (head) => {
        if (input.content) return input.content;
        const markdown = await descriptionMarkdownServer();
        return markdown.reconcile(head.content, markdown.fromMarkdown(input.markdown));
      },
      { authorId: input.authorId, markdownForHash: input.markdown });
  } catch (error) {
    // The Markdown is written and stays the authority; the next reader folds
    // it into the document through the fingerprint.
    console.error("[description-collaboration] write sync failed:", (error as Error).message);
  }
}

/* ── Session reads ────────────────────────────────────────────────────────── */

async function snapshotOf(
  owner: Owner,
  parent: Parent,
  actorId: string,
  canWrite: boolean,
  known?: DocumentHead | null
): Promise<DescriptionSnapshot> {
  const head = await ensureHead(owner, parent, actorId, known);
  return {
    protocol: DESCRIPTION_COLLABORATION_PROTOCOL,
    kind: owner.kind,
    // The id the head wake-ups carry: the row's, which is a plan's own.
    documentId: documentIdOf(owner),
    projectId: owner.projectId,
    revision: head.revision,
    doc: head.content,
    canWrite,
  };
}

export async function readDescriptionSnapshot(kind: DescriptionKind, id: string, actorId: string) {
  const access = await authorizeDescription(kind, id, actorId);
  if (!access.ok) return access;
  return {
    ok: true as const,
    snapshot: await snapshotOf(access.owner, access.parent, actorId, access.canWrite, access.head),
  };
}

/** The accepted steps after `since`, or a fresh snapshot when the journal cannot bridge it. */
export async function readDescriptionSteps(
  kind: DescriptionKind,
  id: string,
  since: number,
  actorId: string
): Promise<{ ok: true; catchUp: DescriptionCatchUp } | { ok: false; status: 404 | 403 }> {
  const access = await authorizeDescription(kind, id, actorId);
  if (!access.ok) return access;
  const head = await ensureHead(access.owner, access.parent, actorId, access.head);
  const reset = async (reason: "gap" | "ahead") => ({
    ok: true as const,
    catchUp: { kind: "reset" as const, reason,
      snapshot: await snapshotOf(access.owner, access.parent, actorId, access.canWrite) },
  });
  if (since > head.revision) return reset("ahead");
  const batches = await readDocumentBatches(access.owner, since, actorId);
  const page = assembleCollabSteps("body", since, head.revision, batches);
  if ("gap" in page) return reset("gap");
  return { ok: true, catchUp: { kind: "steps", ...page } };
}

/* ── Session batches ──────────────────────────────────────────────────────── */

const refused = (reason: CollabRefusal): CollabSubmitResult => ({ status: "refused", reason });

/**
 * One batch from an editing session. Accepted only on the head, when every
 * step applies, the result is a valid description document (no page-tree
 * block, the input gate's checks unchanged) and its Markdown fits.
 */
export async function submitDescriptionBatch(
  kind: DescriptionKind,
  id: string,
  submission: CollabSubmission,
  actorId: string
): Promise<{ ok: true; result: CollabSubmitResult } | { ok: false; status: 404 | 403 }> {
  if (submission.field !== "body") return { ok: true, result: refused("invalid-step") };
  // The receipt is looked up alongside the access decision; it is only
  // answered once access holds.
  const [access, receipt] = await Promise.all([
    authorizeDescription(kind, id, actorId, { write: true }),
    documentBatchReceipt(documentIdOf({ kind, id }), submission.batchId),
  ]);
  if (!access.ok) return access;
  const { owner } = access;
  if (receipt !== null) return { ok: true, result: { status: "accepted", revision: receipt } };
  const head = await ensureHead(owner, access.parent, actorId, access.head);
  if (submission.base !== head.revision) {
    return { ok: true, result: { status: "behind", head: head.revision } };
  }

  const collab = pageCollaborationServer();
  const applied = collab.applyCollabSteps("body", head.content, submission.steps);
  if (!applied.ok) {
    return { ok: true, result: refused(applied.reason === "title-too-long" ? "invalid-document" : applied.reason) };
  }
  const next = applied.doc as JSONContent;
  if (usesPageOnlyNodes(next)) return { ok: true, result: refused("content-refused") };
  const gate = readPageContent(next);
  if (gate === "too-large" || gate === "too-deep") return { ok: true, result: refused("too-large") };
  if (gate === undefined || gate === "refused" || !collab.sameCollabValue("body", gate, next)) {
    return { ok: true, result: refused("content-refused") };
  }
  const markdown = await descriptionMarkdownServer();
  const projected = markdown.toMarkdown(next);
  const ceiling = kind === "plan" ? MAX_PLAN_LENGTH
    : kind === "routine" ? MAX_INSTRUCTION_LENGTH : MAX_DESCRIPTION_LENGTH;
  if (storedText(kind, projected).length > ceiling) return { ok: true, result: refused("too-large") };
  if (submission.presentation && projected !== markdown.toMarkdown(head.content)) {
    return { ok: true, result: refused("presentation-changed") };
  }

  const outcome = await commitDocument(owner, head, next, {
    base: submission.base,
    batchId: submission.batchId,
    clientId: submission.clientId,
    steps: submission.steps,
    authorId: submission.presentation ? null : actorId,
  });
  if (outcome.status === "behind") return { ok: true, result: { status: "behind", head: outcome.head } };
  if (outcome.status === "missing") return { ok: false, status: 404 };
  if (!submission.presentation) scheduleMaterialization(owner, actorId);
  return { ok: true, result: { status: "accepted", revision: outcome.revision } };
}

/* ── Materialization ──────────────────────────────────────────────────────── */

const materializeGenerations = new Map<string, number>();
const materializing = new Map<string, Promise<"materialized" | "unchanged">>();

/** Write the Markdown of the head once typing rests, on this instance. */
function scheduleMaterialization(owner: Owner, authorId: string): void {
  const key = keyOf(owner);
  const generation = (materializeGenerations.get(key) ?? 0) + 1;
  materializeGenerations.set(key, generation);
  afterOrNow(async () => {
    await new Promise((resolve) => setTimeout(resolve, MATERIALIZE_QUIET_MS));
    if (materializeGenerations.get(key) !== generation) return;
    materializeGenerations.delete(key);
    await runMaterialization(owner, authorId);
  });
}

async function runMaterialization(
  owner: Owner,
  authorId: string | null
): Promise<"materialized" | "unchanged"> {
  const key = keyOf(owner);
  const running = materializing.get(key);
  if (running) await running;
  const task = materializeDescription(owner, authorId).then(
    (outcome) => outcome === "materialized" ? "materialized" as const : "unchanged" as const,
    (error: unknown) => {
      console.error("[description-collaboration] materialization failed:", (error as Error).message);
      return "unchanged" as const;
    }).finally(() => {
    if (materializing.get(key) === task) materializing.delete(key);
  });
  materializing.set(key, task);
  return task;
}

/**
 * Write the parent's Markdown for the head, through the ordinary writer so
 * mentions, links, activity, webhooks and indexing follow as for any edit.
 * It is signed by the last account whose typing is pending, read from the
 * journal — batches of one description can reach several instances — or by
 * `authorId` when the journal no longer has it. A parent that is gone, or a
 * write the signer may no longer make, sends the document to the back of the
 * cron's queue rather than blocking it.
 */
export async function materializeDescription(
  owner: Owner,
  authorId: string | null
): Promise<"materialized" | "unchanged" | "missing" | "busy"> {
  const first = await readDocumentHead(owner, null);
  if (!first) return "missing";
  if (first.materializedRevision >= first.revision) return "unchanged";
  const documentId = documentIdOf(owner);
  const claim = await claimDocumentMaterialization(documentId);
  if (!claim) return "busy";
  try {
    const parent = await readParent(owner.kind, owner.id);
    if (!parent) {
      await deferDocumentMaterialization(documentId);
      return "missing";
    }
    // Under the claim, a Markdown that is not the one last materialized was
    // written outside the authority: fold it into the blocks typing did not
    // touch before writing over it.
    let head = first;
    if (first.materializedHash !== markdownFingerprint(documentId, parent.description)) {
      head = await foldExternalWriteUnderTyping(owner, parent.description) ?? first;
    }
    head = await readDocumentHead(owner, null) ?? head;
    if (head.materializedRevision >= head.revision) return "unchanged";
    const markdown = storedText(owner.kind, (await descriptionMarkdownServer()).toMarkdown(head.content));
    // A presentation batch (pills rebuilt by a reader) has no author: the
    // signer is the last author across everything pending.
    const pending = await readPendingBatches(owner, head.materializedRevision, head.revision)
      ?? await readDocumentBatches(owner, head.materializedRevision, null);
    // The signers to try, latest first: the last author of the pending
    // typing, then the earlier ones — one may have lost write access since.
    const authors = [...new Set([
      ...[...pending].reverse().map((batch) => batch.authorId).filter((id): id is string => !!id),
      ...(authorId ? [authorId] : []),
    ])];
    const hash = markdownFingerprint(documentIdOf(owner), markdown);
    if (authors.length === 0 || markdown.trim() === parent.description.trim()) {
      // Nothing to sign: presentation-only batches, or a text already written.
      await markDocumentMaterialized(documentIdOf(owner), head.revision, hash);
      return "unchanged";
    }
    if (owner.kind === "routine" && !markdown.trim()) {
      // A routine always has an instruction: an emptied one is not written,
      // and the document returns to the saved instruction.
      await foldExternalWrite(owner, parent.description, null);
      return "unchanged";
    }
    const write = async (actor: string) => owner.kind === "issue" || owner.kind === "plan"
      ? (await import("@/lib/server/update-issue")).updateIssueFields({
          issueId: owner.id, actorId: actor,
          input: owner.kind === "plan" ? { plan: markdown || null } : { description: markdown || null },
          descriptionFromDocument: owner.kind === "issue",
          planFromDocument: owner.kind === "plan",
        })
      : owner.kind === "routine"
        ? (await import("@/lib/server/routines")).updateRoutine({
            routineId: owner.id, actorId: actor, prompt: markdown, promptMentions: [],
            promptFromDocument: true,
          })
        : (await import("@/lib/server/objectives")).updateObjective({
            objectiveId: owner.id, actorId: actor, input: { description: markdown || null },
            descriptionFromDocument: true,
          });
    let result: Awaited<ReturnType<typeof write>> | null = null;
    for (const actor of authors) {
      result = await write(actor);
      // Refused for this account (403/404): the next author may still write.
      if (result.ok || (result.status !== 403 && result.status !== 404)) break;
    }
    if (!result?.ok) {
      console.error("[description-collaboration] materialization write refused:", result?.status);
      if (result && (result.status === 403 || result.status === 404)) {
        // No author of this typing may write it any more: it is dropped, and
        // the document returns to the text everyone else reads.
        await foldExternalWrite(owner, parent.description, null);
        return "unchanged";
      }
      await deferDocumentMaterialization(documentId);
      return "unchanged";
    }
    await markDocumentMaterialized(documentIdOf(owner), head.revision, hash);
    if (owner.kind === "routine" && authors[0]) scheduleRoutineRetitle(owner.id, authors[0]);
    return "materialized";
  } finally {
    await releaseDocumentMaterialization(documentId, claim);
  }
}

const retitleGenerations = new Map<string, number>();

/**
 * Rename a routine after its instruction once typing has rested for a while
 * on this instance. Each materialization writes the instruction without
 * renaming it: a title is a model call, made once per edit rather than once
 * per pause in the typing.
 */
function scheduleRoutineRetitle(routineId: string, actorId: string): void {
  const generation = (retitleGenerations.get(routineId) ?? 0) + 1;
  retitleGenerations.set(routineId, generation);
  afterOrNow(async () => {
    await new Promise((resolve) => setTimeout(resolve, RETITLE_QUIET_MS));
    if (retitleGenerations.get(routineId) !== generation) return;
    retitleGenerations.delete(routineId);
    const result = await (await import("@/lib/server/routines")).updateRoutine({
      routineId, actorId, refreshTitle: true,
    });
    if (!result.ok) console.error("[description-collaboration] routine retitle failed:", result.status);
  });
}

/**
 * Write what typing left pending before a reader that needs the latest text
 * reads the Markdown: an agent editing a passage must edit what people see.
 */
export async function materializePendingDescription(
  kind: DescriptionKind,
  id: string,
  projectId: string
): Promise<"materialized" | "unchanged"> {
  try {
    return await runMaterialization({ kind, id, projectId }, null);
  } catch (error) {
    console.error("[description-collaboration] read-time materialization failed:", (error as Error).message);
    return "unchanged";
  }
}

/** The cron's safety net: descriptions whose typing no request materialized. */
export async function materializeStaleDescriptions(limit = 50): Promise<{ descriptions: number }> {
  const stale = await staleDocumentStreams(STALE_PENDING_MS, limit);
  for (const owner of stale) await runMaterialization(owner, null);
  return { descriptions: stale.length };
}

/**
 * Start the stream of a description just created from an editor (the
 * creation dialogs), so its first reader opens that document rather than one
 * rebuilt from its Markdown.
 */
export async function seedDescriptionDocument(
  owner: { kind: DescriptionKind; id: string; projectId: string },
  content: JSONContent | null,
  markdown: string
): Promise<void> {
  if (!content) return;
  try {
    await createDocumentStream(owner,
      pageCollaborationServer().canonicalBodyJSON(content) as JSONContent,
      markdownFingerprint(documentIdOf(owner), markdown));
  } catch (error) {
    console.error("[description-collaboration] seed failed:", (error as Error).message);
  }
}
