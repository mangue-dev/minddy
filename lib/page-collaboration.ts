/**
 * The PROTOCOL of live page collaboration (MIN-688), shared by the browser
 * session, the HTTP route and the server authority.
 *
 * ## Model
 *
 * Each page carries two independent step streams, `body` and `title`. A
 * stream's revision is the number of ProseMirror steps it has accepted since
 * the page was created. Clients follow the `prosemirror-collab` contract:
 * they apply their own transactions optimistically, send the unconfirmed steps
 * with the revision they are based on, and receive accepted steps in order —
 * rebasing whatever they have not had confirmed yet.
 *
 * The server is the only authority (lib/server/page-collaboration.ts). It
 * accepts a batch only when its base is the stream head, applies the steps to
 * the stored page and commits the new page projection, the journal row and the
 * new head in one database transaction. The page row stays the canonical
 * document for every other reader (exports, Numo, history, publication).
 *
 * ## Revisions are not versions
 *
 * `Page.version` counts body WRITES (one per accepted body batch, as before) and
 * remains the snapshot CAS of older clients. `content_revision` changes on every
 * row update and protects the shared encrypted envelope. Stream revisions count
 * STEPS. None of the three can stand in for another.
 *
 * ## Recovery
 *
 * The journal keeps a bounded suffix. A writer that cannot express its change
 * as steps opens a gap instead of a rebase. In both cases a client whose
 * revision is no longer covered receives `reset` with a fresh snapshot; it then
 * re-expresses its own unconfirmed work against that snapshot, or keeps it as
 * a recoverable draft when it cannot.
 */

import type { JSONContent } from "@tiptap/core";

export type { CollabField } from "./page-collaboration-document";
import type { CollabField } from "./page-collaboration-document";

/** Bumped when the step or snapshot format changes incompatibly. */
export const PAGE_COLLABORATION_PROTOCOL = 1;

export const COLLAB_FIELDS: readonly CollabField[] = ["body", "title"];

/** Steps per submitted batch; a client sends longer bursts in several. */
export const MAX_COLLAB_BATCH_STEPS = 400;

/** Serialized characters per submitted batch, checked before parsing steps. */
export const MAX_COLLAB_BATCH_CHARS = 400_000;

/** Steps returned by one catch-up read; the client asks again from there. */
export const MAX_COLLAB_CATCH_UP_STEPS = 2_000;

/** How long a session waits after a keystroke before it sends its steps. */
export const COLLAB_SEND_DELAY_MS = 50;

/**
 * The shortest interval between two batches of one session. It bounds the
 * request rate of a fast typist, whatever the server's round trip: without
 * it, a faster server would only mean more requests per second.
 */
export const COLLAB_MIN_SEND_INTERVAL_MS = 250;

/**
 * Reconciliation while a session is open and its tab visible, even when
 * Realtime reports a joined channel: a single lost wake-up must not leave an
 * idle peer stale forever. A hidden tab skips it and catches up when shown.
 */
export const COLLAB_RECONCILE_MS = 45_000;

/** A session ID: one editing session (tab, editor) and one field. */
export const COLLAB_CLIENT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ── Wire shapes ──────────────────────────────────────────────────────────── */

/** One stream's state in a snapshot. */
export interface CollabStreamSnapshot {
  revision: number;
}

/** What a session starts from. Both streams come from one database read. */
export interface PageCollaborationSnapshot {
  protocol: number;
  pageId: string;
  projectId: string;
  /** The body document at `body.revision`, canonical (see `canonicalBodyJSON`). */
  body: CollabStreamSnapshot & { doc: JSONContent };
  /** The title at `title.revision`. */
  title: CollabStreamSnapshot & { text: string };
  /** Page metadata the surface keeps displaying. */
  version: number;
  updatedAt: string;
}

/** Accepted steps after `from`, in order, with the session that sent each. */
export interface CollabStepsPage {
  field: CollabField;
  from: number;
  /** The revision after the last returned step. */
  to: number;
  /** The stream head when the page was read; `to < head` means "ask again". */
  head: number;
  steps: unknown[];
  clientIds: string[];
}

/** The catch-up answer: steps, or a snapshot to restart from. */
export type CollabCatchUp =
  | ({ kind: "steps" } & CollabStepsPage)
  | { kind: "reset"; reason: CollabResetReason; snapshot: PageCollaborationSnapshot };

export type CollabResetReason =
  /** The journal no longer covers the client's revision: it was compacted, or
   *  a writer replaced the document without recording steps. */
  | "gap"
  /** The client claims a revision the server never reached. */
  | "ahead";

/** A batch of steps from one session. */
export interface CollabSubmission {
  field: CollabField;
  /** The stream revision the steps apply to. */
  base: number;
  /** Stable across retries of the same batch; a new one after any rebase. */
  batchId: string;
  clientId: string;
  steps: unknown[];
  /**
   * A presentation-only change (rebuilding mention pills from their plain-text
   * form). The authority accepts it only when the page's Markdown projection
   * is unchanged, and records it without an author: opening a page must not
   * sign it.
   */
  presentation?: boolean;
}

export type CollabSubmitResult =
  | { status: "accepted"; revision: number }
  /** The stream moved: catch up from `head`, rebase, send a new batch. */
  | { status: "behind"; head: number }
  /** Definitively refused: these steps will never be accepted as they are. */
  | { status: "refused"; reason: CollabRefusal };

export type CollabRefusal =
  | "invalid-step"
  | "step-failed"
  | "invalid-document"
  | "title-too-long"
  | "content-refused"
  | "too-large"
  | "presentation-changed"
  | "batch-reused";

/* ── Validation ───────────────────────────────────────────────────────────── */

export function isCollabField(value: unknown): value is CollabField {
  return value === "body" || value === "title";
}

/**
 * Bounds a submission BEFORE any step is deserialized or applied: field,
 * identifiers, revision, step count and serialized size. Structural validity
 * against the schema is the authority's next check.
 */
export function readCollabSubmission(
  value: unknown
): CollabSubmission | "invalid" | "too-large" {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "invalid";
  const input = value as Record<string, unknown>;
  if (!isCollabField(input.field)) return "invalid";
  if (typeof input.base !== "number" || !Number.isSafeInteger(input.base) || input.base < 0) {
    return "invalid";
  }
  if (typeof input.batchId !== "string" || !UUID_RE.test(input.batchId)) return "invalid";
  if (typeof input.clientId !== "string" || !COLLAB_CLIENT_ID_RE.test(input.clientId)) {
    return "invalid";
  }
  if (!Array.isArray(input.steps) || input.steps.length === 0) return "invalid";
  if (input.steps.length > MAX_COLLAB_BATCH_STEPS) return "too-large";
  if (input.steps.some((step) => !step || typeof step !== "object" || Array.isArray(step))) {
    return "invalid";
  }
  if (JSON.stringify(input.steps).length > MAX_COLLAB_BATCH_CHARS) return "too-large";
  if (input.presentation !== undefined && typeof input.presentation !== "boolean") {
    return "invalid";
  }
  if (input.presentation && input.field !== "body") return "invalid";
  return {
    field: input.field,
    base: input.base,
    batchId: input.batchId,
    clientId: input.clientId,
    steps: input.steps,
    presentation: input.presentation === true,
  };
}

/** The `since` query parameter of a catch-up read. */
export function readCollabRevision(value: string | null): number | null {
  if (value === null || !/^\d{1,15}$/.test(value)) return null;
  const revision = Number(value);
  return Number.isSafeInteger(revision) ? revision : null;
}

/* ── Journal assembly (pure, shared with tests) ───────────────────────────── */

/** A journal row as the store returns it, decrypted. */
export interface CollabJournalBatch {
  base: number;
  stepCount: number;
  clientId: string;
  steps: unknown[];
}

/**
 * Turns journal rows into a contiguous catch-up page from `since`, or says why
 * it cannot: a missing first row (compacted, or a gap left by a replacing
 * writer), or a hole in the middle. Rows must be ordered by `base`.
 */
export function assembleCollabSteps(
  field: CollabField,
  since: number,
  head: number,
  rows: readonly CollabJournalBatch[],
  maxSteps = MAX_COLLAB_CATCH_UP_STEPS
): CollabStepsPage | { gap: true } {
  const steps: unknown[] = [];
  const clientIds: string[] = [];
  let at = since;
  for (const row of rows) {
    if (row.base < at) continue;
    if (row.base !== at || row.steps.length !== row.stepCount) return { gap: true };
    if (steps.length > 0 && steps.length + row.stepCount > maxSteps) break;
    for (const step of row.steps) {
      steps.push(step);
      clientIds.push(row.clientId);
    }
    at += row.stepCount;
    if (at >= head) break;
  }
  if (at < head && steps.length === 0) return { gap: true };
  return { field, from: since, to: at, head, steps, clientIds };
}
