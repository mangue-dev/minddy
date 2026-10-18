/**
 * The wire shapes of live descriptions (MIN-728), shared by the browser
 * session (lib/use-description-collaboration.ts) and the authority
 * (lib/server/description-collaboration.ts).
 *
 * A description is ONE step stream, the `body` stream of the page protocol
 * (lib/page-collaboration.ts): the same batches, limits, refusals and
 * catch-up pages. Only the snapshot differs — a description has no title
 * stream — and the endpoint, `/api/documents/<kind>/<id>/collaboration`.
 */

import type { JSONContent } from "@tiptap/core";
import type { CollabResetReason, CollabStepsPage } from "./page-collaboration";

export const DESCRIPTION_COLLABORATION_PROTOCOL = 1;

export type DescriptionKind = "issue" | "objective";

/** Where a session starts: the document at the stream head. */
export interface DescriptionSnapshot {
  protocol: number;
  kind: DescriptionKind;
  documentId: string;
  projectId: string;
  revision: number;
  doc: JSONContent;
  /** Whether this account may send steps (a reader only receives). */
  canWrite: boolean;
}

export type DescriptionCatchUp =
  | ({ kind: "steps" } & CollabStepsPage)
  | { kind: "reset"; reason: CollabResetReason; snapshot: DescriptionSnapshot };

/** The private caret topic of a live description. */
export const descriptionCollaborationTopic = (kind: DescriptionKind, id: string) =>
  `${kind}-collaboration:${id}`;

/* ── Snapshot prefetch (browser) ──────────────────────────────────────────── */

/** How long a prefetched snapshot may wait for the session that opens it. */
const PREFETCH_TTL_MS = 10_000;

const prefetched = new Map<string, { at: number; snapshot: Promise<DescriptionSnapshot> }>();

/** The session snapshot route of a description. */
export const descriptionCollaborationUrl = (kind: DescriptionKind, id: string) =>
  `/api/documents/${kind}/${encodeURIComponent(id)}/collaboration`;

async function fetchSnapshot(kind: DescriptionKind, id: string, signal?: AbortSignal): Promise<DescriptionSnapshot> {
  const response = await fetch(descriptionCollaborationUrl(kind, id), { cache: "no-store", signal });
  if (!response.ok) throw new Error(`Snapshot read failed (${response.status})`);
  return (await response.json()) as DescriptionSnapshot;
}

/**
 * Start reading a description's session snapshot before its surface opens —
 * on the mouse-down that precedes the click opening an issue. Kept in this
 * module, free of the editor, so boards can call it without loading it.
 */
export function prefetchDescriptionSnapshot(kind: DescriptionKind, id: string): void {
  const key = `${kind}:${id}`;
  const current = prefetched.get(key);
  if (current && Date.now() - current.at < PREFETCH_TTL_MS) return;
  const snapshot = fetchSnapshot(kind, id);
  snapshot.catch(() => {
    if (prefetched.get(key)?.snapshot === snapshot) prefetched.delete(key);
  });
  prefetched.set(key, { at: Date.now(), snapshot });
}

/** The prefetched snapshot when it is fresh, used once; otherwise a new read. */
export function takeDescriptionSnapshot(
  kind: DescriptionKind,
  id: string,
  signal: AbortSignal
): Promise<DescriptionSnapshot> {
  const key = `${kind}:${id}`;
  const current = prefetched.get(key);
  prefetched.delete(key);
  if (current && Date.now() - current.at < PREFETCH_TTL_MS) return current.snapshot;
  return fetchSnapshot(kind, id, signal);
}
