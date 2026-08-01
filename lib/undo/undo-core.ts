// Pure data layer of the local undo/redo history (MIN-35). The provider in
// undo-context.tsx owns the stacks and executes entries; everything here is
// side-effect free so it can be unit-tested (see undo-core.test.ts).
//
// An entry records ONE user-initiated issue mutation with enough data to apply
// it in both directions. Undoing a deletion re-creates the issue client-side
// (the server hard-deletes), which yields a NEW id — the alias map keeps older
// entries that still reference the original id applicable.

import type {
  Issue,
  IssueRelation,
  IssueUpdateInput,
} from "@/lib/types";
import type { PendingHandle } from "@/lib/optimistic/pending-writes";

export const UNDO_STACK_LIMIT = 100;
/** Consecutive category entries on the same issue merge within this window. */
export const CATEGORY_COALESCE_MS = 2000;

/** Everything needed to re-create a deleted issue (minus what's lost for good:
    number, comments, attachments, events). */
export interface IssueSnapshot {
  title: string;
  description: string | null;
  plan: string | null;
  status: Issue["status"];
  priority: Issue["priority"];
  effort: Issue["effort"];
  assignee_id: string | null;
  objective_id: string | null;
  parent_id: string | null;
  duplicate_of_id: string | null;
  due_date: string | null;
  position: number;
  cycle_id: string | null;
  category_ids: string[];
}

/** A stored relation row minus its id (ids change when a row is re-created). */
export type RelationSnapshot = Omit<IssueRelation, "id">;

/** A recordable mutation, as the hooks hand it over (timestamp added on push). */
export type UndoAction =
  | {
      kind: "update";
      projectId: string;
      issueId: string;
      before: IssueUpdateInput;
      after: IssueUpdateInput;
    }
  | {
      kind: "categories";
      projectId: string;
      issueId: string;
      before: string[];
      after: string[];
    }
  | { kind: "create"; projectId: string; issueId: string; snapshot: IssueSnapshot }
  | {
      kind: "delete";
      projectId: string;
      issueId: string;
      snapshot: IssueSnapshot;
      /** Sub-issues orphaned by the deletion (parent_id is ON DELETE SET NULL). */
      childIds: string[];
      /** Stored relation rows that cascaded with the issue. */
      relations: RelationSnapshot[];
    }
  | {
      kind: "relation-add";
      projectId: string;
      /** Mutable: rewritten in place when a replay re-creates the row. */
      relationId: string;
      relation: RelationSnapshot;
    }
  | {
      kind: "relation-remove";
      projectId: string;
      relationId: string;
      relation: RelationSnapshot;
    };

// The intersection distributes over the union, so narrowing on `kind` holds.
export type UndoEntry = UndoAction & {
  at: number;
  /** Ordering barrier: resolves when the recorded write settled on the server.
      An undo/redo replay awaits it before sending its own write, so an instant
      ⌘Z can't overtake the in-flight mutation it reverts. Mutable (a debounce
      window swaps in the promise of its own flush). Never rejects. */
  settled?: Promise<unknown>;
  /** Set when the recorded write failed (entry retracted) — replays skip it. */
  dead?: boolean;
  /** Entrée du registre d'écritures en attente ouverte par le rejouage
      (MIN-156) : un ⌘Z subit exactement le même écrasement par une réponse en
      retard qu'une édition directe. Refermée quand le rejouage a abouti. */
  pending?: PendingHandle;
};

export function snapshotIssue(issue: Issue): IssueSnapshot {
  return {
    title: issue.title,
    description: issue.description ?? null,
    plan: issue.plan ?? null,
    status: issue.status,
    priority: issue.priority,
    effort: issue.effort ?? null,
    assignee_id: issue.assignee_id ?? null,
    objective_id: issue.objective_id ?? null,
    parent_id: issue.parent_id ?? null,
    duplicate_of_id: issue.duplicate_of_id ?? null,
    due_date: issue.due_date ?? null,
    position: issue.position,
    cycle_id: issue.cycle_id ?? null,
    category_ids: issue.category_ids ?? [],
  };
}

/**
 * The inverse of a PATCH: for each key the patch touches, the issue's current
 * value — with explicit nulls (JSON drops undefined, and the API clears
 * nullable fields on null). Returns null when the patch is a no-op so the
 * caller skips recording (e.g. a picker re-selecting the current value).
 */
export function buildBeforePatch(
  issue: Issue,
  patch: IssueUpdateInput
): IssueUpdateInput | null {
  const before: Record<string, unknown> = {};
  let changed = false;
  for (const key of Object.keys(patch) as (keyof IssueUpdateInput)[]) {
    const prev = (issue[key] as unknown) ?? null;
    before[key] = prev;
    if (prev !== ((patch[key] as unknown) ?? null)) changed = true;
  }
  return changed ? (before as IssueUpdateInput) : null;
}

/**
 * Resolve an issue id through the alias chain left by re-creations
 * (old → new → newer). Bounded so a (theoretically impossible) cycle
 * can't hang the executor.
 */
export function resolveAliased(
  alias: ReadonlyMap<string, string>,
  id: string
): string {
  let current = id;
  for (let hops = 0; hops < 100; hops += 1) {
    const next = alias.get(current);
    if (!next || next === current) return current;
    current = next;
  }
  return current;
}

/**
 * Push onto the undo stack, coalescing rapid category toggles on the same
 * issue into one entry (oldest `before`, newest `after`) and capping the
 * stack by dropping its oldest entry. Returns the canonical entry now on the
 * stack — the merged-into one when coalescing — mutated IN PLACE so callers
 * holding it (for retraction or live `after` updates) keep a valid reference.
 */
export function pushEntry(stack: UndoEntry[], entry: UndoEntry): UndoEntry {
  const last = stack[stack.length - 1];
  if (
    entry.kind === "categories" &&
    last?.kind === "categories" &&
    last.issueId === entry.issueId &&
    entry.at - last.at <= CATEGORY_COALESCE_MS
  ) {
    last.after = entry.after;
    last.at = entry.at;
    return last;
  }
  stack.push(entry);
  if (stack.length > UNDO_STACK_LIMIT) stack.shift();
  return entry;
}
