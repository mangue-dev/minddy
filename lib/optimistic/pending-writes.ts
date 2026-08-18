// Pending writes register (MIN-156).
//
// The problem it solves: a GET response gone BEFORE a write
// is committed, but arrived AFTER its optimistic patch, rewrites the cache with
// the lines before — the card returns to its original column and never leaves again
// than the response of the following GET. This is the flicker of several seconds.
//
// The remedy: any response passes through this register before entering the cache.
// A write is registered there at the time of its optimistic patch (`begin`) and does not
// output only once a fetch left AFTER its server confirmation (`settle`) has
// answered. A late response can therefore no longer undo what the user
// just done, regardless of order of arrival.
//
// The contract is TEMPORAL, not versioned: we apply an entry as long as
// `settledAt === null || settledAt > fetchStartedAt`. Pas de comparaison
// of `updated_at` — the server clock is not ours and loads
// aggregates don't expose it everywhere. Conservative by construction: we can
// re-apply a patch that the response already contained, which has no effect.
//
// Module pur (pas de React, pas de react-query, horloge injectable) : voir
// pending-writes.test.ts. Application registers live in issue-writes.ts.

/** What a write promises to the cache, while waiting for the server line. */
export type PendingEntry<T> =
  | { kind: "patch"; id: string; patch: Partial<T> }
  | { kind: "insert"; row: T }
  | { kind: "remove"; id: string };

/** Handle rendered by `begin`, to be returned to `settle` / `fail`. */
export interface PendingHandle {
  readonly seq: number;
}

/** Server line such as a real-time echo carries it (id + updated_at). */
interface Stamp {
  id: string;
  updated_at: string;
}

interface Slot<T> {
  seq: number;
  entry: PendingEntry<T>;
  /** null until the server confirms; otherwise the moment of the response. */
  settledAt: number | null;
  /** Confirmed server line identity, for `wasJustWritten`. */
  stamp: Stamp | null;
}

export interface PendingWrites<T extends { id: string }> {
  /** Logs a write at the time of its optimistic patch. */
  begin(entry: PendingEntry<T>): PendingHandle;
  /**
 * Server confirmed. The entry remains applied to responses left before
 * this time, then is purged. `serverRow` (the line returned by the PATCH /
 * POST) refines the patch — it carries server side effects that
 * the optimist did not know about — and serves as a fingerprint for `wasJustWritten`.
 */
  settle(handle: PendingHandle, serverRow?: Partial<T>): void;
  /** The write failed: the entry is forgotten immediately. */
  fail(handle: PendingHandle): void;
  /**
 * Overlaps still pending writes on a fetch response.
 * `fetchStartedAt` is the time the request GONE, not when it
 * returned. Never mutate `rows` and return the original array when
 * nothing applies (react-query does structural sharing behind).
 */
  apply(rows: T[], fetchStartedAt: number): T[];
  /**
 * Is this line the echo of a write we have just made?
 *
 * Two rules, because the order of arrival is not guaranteed — the diffusion
 * starts from the trigger AT COMMIT, therefore typically BEFORE the HTTP response from
 * PATCH returns to browser (measured: 4 ms before):
 *
 * 1. a write is still IN FLIGHT on this line (`begin` without `settle`) —
 * whatever the server did, our own return will write the authoritative line
 * in the caches ;
 * 2. otherwise, `id` + `updated_at` correspond to the stored server line
 * at `settle` — the echo arrived after the response.
 *
 * `id` is retrieved by the caller: depending on the table, the ticket row is
 * denoted by `id` (issues) or by `issue_id` (issue_categories).
 */
  wasJustWritten(id: unknown, record?: unknown): boolean;
  /** Tests only: clears the registry. */
  reset(): void;
}

export interface PendingWritesOptions {
  /** Injectable clock — no hard-coded `Date.now()` in pure functions. */
  now?: () => number;
  /** Retention after confirmation, before purge. */
  retentionMs?: number;
}

/**
 * Default retention: 30 s. Well above the duration of a GET
 * `/api/me/board`, and short enough that a patch does not survive a teammate's writing
 * on the same line.
 */
export const DEFAULT_RETENTION_MS = 30_000;

/** The id of the line that the input touches, regardless of its form. */
function entryId<T extends { id: string }>(entry: PendingEntry<T>): string {
  return entry.kind === "insert" ? entry.row.id : entry.id;
}

function stampOf(row: unknown): Stamp | null {
  if (!row || typeof row !== "object") return null;
  const { id, updated_at: updatedAt } = row as {
    id?: unknown;
    updated_at?: unknown;
  };
  return typeof id === "string" && typeof updatedAt === "string"
    ? { id, updated_at: updatedAt }
    : null;
}

export function createPendingWrites<T extends { id: string }>(
  options: PendingWritesOptions = {}
): PendingWrites<T> {
  const now = options.now ?? (() => Date.now());
  const retentionMs = options.retentionMs ?? DEFAULT_RETENTION_MS;

  // Insertion order = order of `seq` increasing: the patches merge into
  // the order in which they were made, the last one wins field by field.
  const slots = new Map<number, Slot<T>>();
  let nextSeq = 1;

  /** Forget entries confirmed for more than `retentionMs`. */
  function purge(): void {
    const cutoff = now() - retentionMs;
    for (const [seq, slot] of slots) {
      if (slot.settledAt !== null && slot.settledAt <= cutoff) slots.delete(seq);
    }
  }

  return {
    begin(entry) {
      const seq = nextSeq;
      nextSeq += 1;
      slots.set(seq, { seq, entry, settledAt: null, stamp: null });
      return { seq };
    },

    settle(handle, serverRow) {
      const slot = slots.get(handle.seq);
      if (!slot) return;
      slot.settledAt = now();
      slot.stamp = stampOf(serverRow);
      if (!serverRow) return;
      // The server line is authoritative: it is subsequent to any response
      // that we will continue to overlay, so merging it can only refine it.
      if (slot.entry.kind === "patch") {
        slot.entry = {
          kind: "patch",
          id: slot.entry.id,
          patch: { ...slot.entry.patch, ...serverRow },
        };
      } else if (slot.entry.kind === "insert") {
        slot.entry = {
          kind: "insert",
          row: { ...slot.entry.row, ...serverRow },
        };
      }
    },

    fail(handle) {
      slots.delete(handle.seq);
    },

    apply(rows, fetchStartedAt) {
      purge();
      const removed = new Set<string>();
      const patches = new Map<string, Partial<T>>();
      const inserts = new Map<string, T>();
      let live = 0;

      for (const slot of slots.values()) {
        if (slot.settledAt !== null && slot.settledAt <= fetchStartedAt) continue;
        live += 1;
        switch (slot.entry.kind) {
          case "remove":
            removed.add(slot.entry.id);
            patches.delete(slot.entry.id);
            inserts.delete(slot.entry.id);
            break;
          case "patch": {
            const { id, patch } = slot.entry;
            removed.delete(id);
            patches.set(id, { ...patches.get(id), ...patch });
            const inserted = inserts.get(id);
            if (inserted) inserts.set(id, { ...inserted, ...patch });
            break;
          }
          case "insert": {
            const { row } = slot.entry;
            removed.delete(row.id);
            inserts.set(row.id, { ...row, ...patches.get(row.id) });
            break;
          }
        }
      }
      if (live === 0) return rows;

      const next: T[] = [];
      let changed = false;
      for (const row of rows) {
        if (removed.has(row.id)) {
          changed = true;
          continue;
        }
        const patch = patches.get(row.id);
        if (patch) {
          next.push({ ...row, ...patch });
          changed = true;
        } else {
          next.push(row);
        }
      }
      // The answer is authentic for what it already contains: we only add the
      // lines that are missing, never a duplicate.
      const present = new Set(rows.map((row) => row.id));
      for (const [id, row] of inserts) {
        if (present.has(id)) continue;
        next.push(row);
        changed = true;
      }
      return changed ? next : rows;
    },

    wasJustWritten(id, record) {
      purge();
      if (typeof id !== "string" || !id) return false;
      const stamp = stampOf(record);
      for (const slot of slots.values()) {
        if (slot.settledAt === null && entryId(slot.entry) === id) return true;
        if (
          stamp &&
          slot.stamp &&
          slot.stamp.id === stamp.id &&
          slot.stamp.updated_at === stamp.updated_at
        ) {
          return true;
        }
      }
      return false;
    },

    reset() {
      slots.clear();
    },
  };
}
