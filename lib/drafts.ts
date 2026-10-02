// Local draft store (MIN-41) — when a create dialog is abandoned with content
// still in it, the form state is stashed here instead of being lost, and a
// recovery row above the title field lets the user restore or delete it later.
//
// Drafts use server-authenticated envelopes in localStorage, with no key on the
// device. Each kind keeps a capped, most-recent-first list for 30 days. Drafts are
// scoped to a project id because most of their fields (status, assignee,
// objective, category ids) are meaningless outside the project they were
// written in — so a draft is only ever offered inside its own project.
//
// Server-safe by guard: every accessor short-circuits when `window` is absent.

import type {
  IssueStatus,
  IssuePriority,
  IssueEffort,
} from "@/lib/issue-constants";
import type { ObjectiveStatus } from "@/lib/objective-constants";
import type { RecurrenceCadence } from "@/lib/recurrence";
import type { AttachmentInput, PendingRelationInput, ResourceInput } from "@/lib/types";
import { localSnapshotGeneration, restoreLocalSnapshot, saveLocalSnapshot } from "./local-snapshots";

export type DraftKind = "issue" | "objective";

interface DraftBase {
  /** Stable id — reused so re-closing an in-progress draft updates in place. */
  id: string;
  /** The project the draft belongs to (drafts are only offered in their own). */
  projectId: string;
  /** Epoch ms of the last save — drives the most-recent-first ordering. */
  updatedAt: number;
  /** Absent from drafts saved before creation supported relations. */
  relations?: PendingRelationInput[];
}

export interface IssueDraft extends DraftBase {
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  effort: IssueEffort | null;
  assignee_id: string | null;
  objective_id: string | null;
  due_date: string | null;
  /** Repeat rate (MIN-136). Absent from drafts written before. */
  recurrence?: RecurrenceCadence | null;
  category_ids: string[];
  /** Resources already added: storage references (the bucket keeps them) and
      resolved links. */
  resources: ResourceInput[];
  /** What the draft was called before MIN-184 — drafts with
 this key are already sleeping in browsers, `readDrafts` migrates them. */
  attachments?: AttachmentInput[];
}

export interface ObjectiveDraft extends DraftBase {
  name: string;
  description: string;
  status: ObjectiveStatus;
  lead_user_id: string | null;
  target_date: string | null;
  color: string | null;
  /** Resources already added. Absent from drafts saved before objectives took
      any — read it defensively. */
  resources?: ResourceInput[];
  /** Same: the key from before MIN-184, migrated for reading. */
  attachments?: AttachmentInput[];
}

export type DraftFor<K extends DraftKind> = K extends "issue"
  ? IssueDraft
  : ObjectiveDraft;

/** Keep the list short — this is a recovery aid, not a history. */
export const MAX_DRAFTS = 10;
export const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const keyFor = (kind: DraftKind) => `minddy:drafts:${kind}`;
const queues = new Map<DraftKind, Promise<unknown>>();
export class LegacyDraftRecoveryRequired extends Error {}

async function withDraftLock<T>(kind: DraftKind, operation: (guard: () => void) => Promise<T>): Promise<T> {
  const generation = localSnapshotGeneration();
  const guard = () => {
    if (generation !== localSnapshotGeneration()) throw new Error("Local account changed");
  };
  const guarded = async () => {
    guard();
    const result = await operation(guard);
    guard();
    return result;
  };
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(`minddy:drafts:${kind}`, guarded);
  }
  const prior = queues.get(kind) ?? Promise.resolve();
  const result = prior.catch(() => {}).then(guarded);
  queues.set(kind, result);
  try { return await result; }
  finally { if (queues.get(kind) === result) queues.delete(kind); }
}

const byRecency = (a: DraftBase, b: DraftBase) => b.updatedAt - a.updatedAt;

/**
 * A draft written before MIN-184 has its files under `attachments`. It
 * sleeps in a browser that no deployment updates: its key is read
 * here and put into `resources`, otherwise restoring such a draft
 * would silently lose what was attached to it.
 */
function migrateDraft<K extends DraftKind>(draft: DraftFor<K>): DraftFor<K> {
  const legacy = (draft as { attachments?: AttachmentInput[] }).attachments;
  if (!legacy || (draft as { resources?: ResourceInput[] }).resources) return draft;
  return { ...draft, resources: legacy };
}

async function readRaw<K extends DraftKind>(kind: K, recoverLegacy = false, guard = () => {}): Promise<DraftFor<K>[]> {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(kind));
    if (!raw) return [];
    const stored = JSON.parse(raw);
    if (Array.isArray(stored) && !recoverLegacy) throw new LegacyDraftRecoveryRequired();
    const parsed = stored?.format === "minddy-local-v1"
      ? await restoreLocalSnapshot(window.localStorage, keyFor(kind), `${kind}-drafts`)
      : stored;
    // Legacy drafts are sealed before their clear disk copy is replaced. A
    // failed seal leaves them recoverable and reports an error to the dialog.
    if (Array.isArray(parsed) && stored?.format !== "minddy-local-v1") {
      guard();
      await saveLocalSnapshot(window.localStorage, keyFor(kind), `${kind}-drafts`, parsed, true);
    }
    return Array.isArray(parsed)
      ? (parsed as DraftFor<K>[]).filter((draft) => Number.isFinite(draft.updatedAt) && Date.now() - draft.updatedAt <= DRAFT_MAX_AGE_MS).map(migrateDraft)
      : [];
  } catch (error) {
    if (error instanceof LegacyDraftRecoveryRequired) throw error;
    throw new Error("Unable to restore saved drafts");
  }
}

async function persist<K extends DraftKind>(
  kind: K,
  drafts: DraftFor<K>[]
): Promise<DraftFor<K>[]> {
  const trimmed = [...drafts].sort(byRecency).slice(0, MAX_DRAFTS);
  if (typeof window !== "undefined") {
    await saveLocalSnapshot(window.localStorage, keyFor(kind), `${kind}-drafts`, trimmed);
  }
  return trimmed;
}

/** Every draft of a kind, most recent first. */
export async function readDrafts<K extends DraftKind>(kind: K, recoverLegacy = false): Promise<DraftFor<K>[]> {
  return withDraftLock(kind, async (guard) => (await readRaw(kind, recoverLegacy, guard)).sort(byRecency));
}

/** Insert or replace a draft (matched by id) and return the trimmed list. */
export async function upsertDraft<K extends DraftKind>(
  kind: K,
  draft: DraftFor<K>
): Promise<DraftFor<K>[]> {
  return withDraftLock(kind, async (guard) => {
    const rest = (await readRaw(kind)).filter((d) => d.id !== draft.id);
    guard();
    return persist(kind, [draft, ...rest]);
  });
}

/** Drop a draft by id and return the remaining list. */
export async function deleteDraft<K extends DraftKind>(
  kind: K,
  id: string
): Promise<DraftFor<K>[]> {
  return withDraftLock(kind, async (guard) => {
    const remaining = (await readRaw(kind)).filter((d) => d.id !== id);
    guard();
    return persist(kind, remaining);
  });
}
