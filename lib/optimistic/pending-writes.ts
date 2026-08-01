// Registre des écritures en attente (MIN-156).
//
// Le problème qu'il résout : une réponse de GET partie AVANT qu'une écriture ne
// soit commitée, mais arrivée APRÈS son patch optimiste, réécrit le cache avec
// les lignes d'avant — la carte revient dans sa colonne d'origine et n'en repart
// qu'à la réponse du GET suivant. C'est le flicker de plusieurs secondes.
//
// Le remède : toute réponse traverse ce registre avant d'entrer dans le cache.
// Une écriture s'y inscrit au moment de son patch optimiste (`begin`) et n'en
// sort qu'une fois qu'un fetch parti APRÈS sa confirmation serveur (`settle`) a
// répondu. Une réponse en retard ne peut donc plus défaire ce que l'utilisateur
// vient de faire, quel que soit l'ordre d'arrivée.
//
// Le contrat est TEMPOREL, pas versionné : on applique une entrée tant que
// `settledAt === null || settledAt > fetchStartedAt`. Pas de comparaison
// d'`updated_at` — l'horloge du serveur n'est pas la nôtre et les charges
// agrégées ne l'exposent pas partout. Conservateur par construction : on peut
// ré-appliquer un patch que la réponse contenait déjà, ce qui est sans effet.
//
// Module pur (pas de React, pas de react-query, horloge injectable) : voir
// pending-writes.test.ts. Les registres applicatifs vivent dans issue-writes.ts.

/** Ce qu'une écriture promet au cache, en attendant la ligne serveur. */
export type PendingEntry<T> =
  | { kind: "patch"; id: string; patch: Partial<T> }
  | { kind: "insert"; row: T }
  | { kind: "remove"; id: string };

/** Poignée rendue par `begin`, à repasser à `settle` / `fail`. */
export interface PendingHandle {
  readonly seq: number;
}

/** Ligne serveur telle qu'un écho temps réel la porte (id + updated_at). */
interface Stamp {
  id: string;
  updated_at: string;
}

interface Slot<T> {
  seq: number;
  entry: PendingEntry<T>;
  /** null tant que le serveur n'a pas confirmé ; sinon l'instant de la réponse. */
  settledAt: number | null;
  /** Identité de la ligne serveur confirmée, pour `wasJustWritten`. */
  stamp: Stamp | null;
}

export interface PendingWrites<T extends { id: string }> {
  /** Inscrit une écriture au moment de son patch optimiste. */
  begin(entry: PendingEntry<T>): PendingHandle;
  /**
   * Le serveur a confirmé. L'entrée reste appliquée aux réponses parties avant
   * cet instant, puis est purgée. `serverRow` (la ligne renvoyée par le PATCH /
   * POST) affine le patch — elle porte les effets de bord serveur que
   * l'optimiste ne connaissait pas — et sert d'empreinte à `wasJustWritten`.
   */
  settle(handle: PendingHandle, serverRow?: Partial<T>): void;
  /** L'écriture a échoué : l'entrée est oubliée immédiatement. */
  fail(handle: PendingHandle): void;
  /**
   * Superpose les écritures encore en attente à une réponse de fetch.
   * `fetchStartedAt` est l'instant où la requête est PARTIE, pas celui où elle
   * est revenue. Ne mute jamais `rows` et renvoie le tableau d'origine quand
   * rien ne s'applique (react-query fait du structural sharing derrière).
   */
  apply(rows: T[], fetchStartedAt: number): T[];
  /**
   * Cette ligne est-elle l'écho d'une écriture qu'on vient de faire ?
   *
   * Deux règles, parce que l'ordre d'arrivée n'est pas garanti — la diffusion
   * part du trigger AU COMMIT, donc typiquement AVANT que la réponse HTTP du
   * PATCH ne revienne au navigateur (mesuré : 4 ms avant) :
   *
   * 1. une écriture est encore EN VOL sur cette ligne (`begin` sans `settle`) —
   *    quoi qu'ait fait le serveur, notre propre retour va écrire la ligne
   *    faisant autorité dans les caches ;
   * 2. sinon, `id` + `updated_at` correspondent à la ligne serveur mémorisée
   *    au `settle` — l'écho arrivé après la réponse.
   *
   * `id` est extrait par l'appelant : selon la table, la ligne du ticket est
   * désignée par `id` (issues) ou par `issue_id` (issue_categories).
   */
  wasJustWritten(id: unknown, record?: unknown): boolean;
  /** Tests seulement : vide le registre. */
  reset(): void;
}

export interface PendingWritesOptions {
  /** Horloge injectable — aucun `Date.now()` en dur dans les fonctions pures. */
  now?: () => number;
  /** Rétention après confirmation, avant purge. */
  retentionMs?: number;
}

/**
 * Rétention par défaut : 30 s. Largement au-dessus de la durée d'un GET
 * `/api/me/board`, et assez court pour qu'un patch ne survive pas à l'écriture
 * d'un coéquipier sur la même ligne.
 */
export const DEFAULT_RETENTION_MS = 30_000;

/** L'id de la ligne que l'entrée touche, quelle que soit sa forme. */
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

  // Insertion order = ordre de `seq` croissant : les patchs se fusionnent dans
  // l'ordre où ils ont été faits, le dernier gagne champ par champ.
  const slots = new Map<number, Slot<T>>();
  let nextSeq = 1;

  /** Oublie les entrées confirmées depuis plus de `retentionMs`. */
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
      // La ligne serveur fait autorité : elle est postérieure à toute réponse
      // qu'on continuera d'overlayer, donc la fusionner ne peut qu'affiner.
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
      // La réponse fait foi pour ce qu'elle contient déjà : on n'ajoute que les
      // lignes qui en sont absentes, jamais un doublon.
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
