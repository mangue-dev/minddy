// Local draft store (MIN-41) — when a create dialog is abandoned with content
// still in it, the form state is stashed here instead of being lost, and a
// recovery row above the title field lets the user restore or delete it later.
//
// Drafts live ONLY in the browser's localStorage: no server, no DB. Each kind
// (issue / objective) keeps its own capped, most-recent-first list. Drafts are
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
import type { AttachmentInput, ResourceInput } from "@/lib/types";

export type DraftKind = "issue" | "objective";

interface DraftBase {
  /** Stable id — reused so re-closing an in-progress draft updates in place. */
  id: string;
  /** The project the draft belongs to (drafts are only offered in their own). */
  projectId: string;
  /** Epoch ms of the last save — drives the most-recent-first ordering. */
  updatedAt: number;
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
  /** Cadence de répétition (MIN-136). Absente des brouillons écrits avant. */
  recurrence?: RecurrenceCadence | null;
  category_ids: string[];
  /** Resources already added: storage references (the bucket keeps them) and
      resolved links. */
  resources: ResourceInput[];
  /** Ce que le brouillon s'appelait avant MIN-184 — des brouillons portant
      cette clé dorment déjà dans des navigateurs, `readDrafts` les migre. */
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
  /** Idem : la clé d'avant MIN-184, migrée à la lecture. */
  attachments?: AttachmentInput[];
}

export type DraftFor<K extends DraftKind> = K extends "issue"
  ? IssueDraft
  : ObjectiveDraft;

/** Keep the list short — this is a recovery aid, not a history. */
export const MAX_DRAFTS = 10;

const keyFor = (kind: DraftKind) => `minddy:drafts:${kind}`;

const byRecency = (a: DraftBase, b: DraftBase) => b.updatedAt - a.updatedAt;

/**
 * Un brouillon écrit avant MIN-184 porte ses fichiers sous `attachments`. Il
 * dort dans un navigateur qu'aucun déploiement ne met à jour : sa clé est lue
 * ici et versée dans `resources`, faute de quoi restaurer un tel brouillon
 * perdrait silencieusement ce qu'on y avait joint.
 */
function migrateDraft<K extends DraftKind>(draft: DraftFor<K>): DraftFor<K> {
  const legacy = (draft as { attachments?: AttachmentInput[] }).attachments;
  if (!legacy || (draft as { resources?: ResourceInput[] }).resources) return draft;
  return { ...draft, resources: legacy };
}

function readRaw<K extends DraftKind>(kind: K): DraftFor<K>[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(kind));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? (parsed as DraftFor<K>[]).map(migrateDraft)
      : [];
  } catch {
    // Corrupt JSON or localStorage unavailable (private mode) — start empty.
    return [];
  }
}

function persist<K extends DraftKind>(
  kind: K,
  drafts: DraftFor<K>[]
): DraftFor<K>[] {
  const trimmed = [...drafts].sort(byRecency).slice(0, MAX_DRAFTS);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(keyFor(kind), JSON.stringify(trimmed));
    } catch {
      /* quota / disabled — the draft simply isn't kept. */
    }
  }
  return trimmed;
}

/** Every draft of a kind, most recent first. */
export function readDrafts<K extends DraftKind>(kind: K): DraftFor<K>[] {
  return readRaw(kind).sort(byRecency);
}

/** Insert or replace a draft (matched by id) and return the trimmed list. */
export function upsertDraft<K extends DraftKind>(
  kind: K,
  draft: DraftFor<K>
): DraftFor<K>[] {
  const rest = readRaw(kind).filter((d) => d.id !== draft.id);
  return persist(kind, [draft, ...rest]);
}

/** Drop a draft by id and return the remaining list. */
export function deleteDraft<K extends DraftKind>(
  kind: K,
  id: string
): DraftFor<K>[] {
  return persist(
    kind,
    readRaw(kind).filter((d) => d.id !== id)
  );
}
