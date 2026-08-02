// Ce que contient chaque colonne, compté UNE fois.
//
// Cinq choses veulent savoir la même chose d'un fichier — quelles valeurs
// distinctes porte cette colonne, et combien de fois : la construction du plan,
// la détection des trous, le résumé envoyé au modèle, la liste de valeurs du
// tableau de correspondance, et les exemples affichés sous chaque en-tête.
// Chacune balayait le fichier de son côté ; sur un export de 2 000 lignes et
// 30 colonnes, refait à chaque retouche du tableau, ça se voit à l'écran.
//
// Un seul balayage, au dépôt du fichier, et tout le monde lit ce tableau.

import type { CsvTable } from "@/lib/import/normalize";
import { normalizeToken } from "@/lib/import/normalize";

/** Au-delà, une colonne n'est plus une énumération mais du texte libre : on
 *  arrête de retenir ses valeurs, on continue de les compter. */
export const MAX_TRACKED_VALUES = 200;

export interface ColumnValue {
  /** La première graphie rencontrée — celle qu'on montre à l'utilisateur. */
  label: string;
  count: number;
}

export interface ColumnStats {
  index: number;
  header: string;
  /** jeton normalisé → graphie + occurrences, dans l'ordre d'apparition. */
  values: Map<string, ColumnValue>;
  /** Nombre de valeurs distinctes, même au-delà de ce qui est retenu. */
  distinctCount: number;
  /** `values` a été plafonné : la colonne est du texte libre. */
  truncated: boolean;
  /** Cellules non vides — une colonne toujours vide ne vaut pas d'être placée. */
  filled: number;
}

export type TableStats = ColumnStats[];

export function computeStats(table: CsvTable): TableStats {
  const stats: TableStats = table.headers.map((header, index) => ({
    index,
    header,
    values: new Map(),
    distinctCount: 0,
    truncated: false,
    filled: 0,
  }));

  // Une seule traversée du fichier, colonnes en boucle interne : c'est l'ordre
  // qui garde les lignes en cache, pas l'inverse.
  for (const row of table.rows) {
    for (let i = 0; i < stats.length; i++) {
      const raw = (row[i] ?? "").trim();
      if (!raw) continue;
      const col = stats[i];
      col.filled += 1;
      const token = normalizeToken(raw);
      if (!token) continue;
      const existing = col.values.get(token);
      if (existing) {
        existing.count += 1;
      } else if (col.values.size < MAX_TRACKED_VALUES) {
        col.values.set(token, { label: raw, count: 1 });
        col.distinctCount += 1;
      } else {
        col.truncated = true;
        col.distinctCount += 1;
      }
    }
  }

  return stats;
}

/** Les valeurs d'une colonne, les plus fréquentes d'abord. */
export function topValues(col: ColumnStats, limit: number): ColumnValue[] {
  return [...col.values.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

/** Les valeurs distinctes de TOUTES les colonnes d'un champ, ordre du fichier. */
export function valuesOfColumns(
  stats: TableStats,
  indexes: number[]
): Map<string, ColumnValue> {
  if (indexes.length === 1) return stats[indexes[0]]?.values ?? new Map();

  const merged = new Map<string, ColumnValue>();
  for (const index of indexes) {
    for (const [token, value] of stats[index]?.values ?? []) {
      const existing = merged.get(token);
      if (existing) existing.count += value.count;
      else merged.set(token, { ...value });
    }
  }
  return merged;
}
