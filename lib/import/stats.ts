// What each column contains, counted ONE time.
//
// Five things want to know the same thing from a file — what values
// distinct carries this column, and how many times: the construction of the plan,
// hole detection, summary sent to the model, list of values ​​of the
// correspondence table, and examples displayed under each header.
// Each person scanned the file on their own; on an export of 2,000 lines and
// 30 columns, redone each time the table is retouched, you can see it on the screen.
//
// A single scan, when submitting the file, and everyone reads this table.

import type { CsvTable } from "@/lib/import/normalize";
import { normalizeToken } from "@/lib/import/normalize";

/** Beyond that, a column is no longer an enumeration but free text: on
 * stops retaining its values, we continue counting them. */
export const MAX_TRACKED_VALUES = 200;

export interface ColumnValue {
  /** The first spelling encountered — the one shown to the user. */
  label: string;
  count: number;
}

export interface ColumnStats {
  index: number;
  header: string;
  /** normalized token → spelling + occurrences, in order of appearance. */
  values: Map<string, ColumnValue>;
  /** Number of distinct values, even beyond what is retained. */
  distinctCount: number;
  /** `values` has been capped: the column is free text. */
  truncated: boolean;
  /** Non-empty cells — a column that is always empty is not worth placing. */
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

  // A single traversal of the file, columns in an internal loop: this is the order
  // which keeps the lines cached, not the other way around.
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

/** The values ​​of a column, the most frequent first. */
export function topValues(col: ColumnStats, limit: number): ColumnValue[] {
  return [...col.values.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

/** The distinct values ​​of ALL columns in a field, file order. */
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
