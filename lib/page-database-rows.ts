import { positionBetween } from "./pages";

export interface DatabaseRowPosition {
  id: string;
  position: string;
}

/** Allocate positions around an existing row, excluding rows being moved. */
export function databaseRowPositions(
  entries: readonly DatabaseRowPosition[],
  targetId: string,
  above: boolean,
  movingIds: readonly string[] = [],
  count = 1,
): string[] {
  const remaining = entries
    .filter((entry) => !movingIds.includes(entry.id))
    .toSorted((a, b) =>
      a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
    );
  const index = remaining.findIndex((entry) => entry.id === targetId);
  if (index < 0) return [];
  const insertionIndex = index + (above ? 0 : 1);
  let before = remaining[insertionIndex - 1]?.position;
  const after = remaining[insertionIndex]?.position;
  return Array.from({ length: count }, () => {
    const position = positionBetween(before, after);
    before = position;
    return position;
  });
}

/** Shift-selection follows the visible row order, including an active sort. */
export function selectDatabaseRows(
  visibleIds: readonly string[],
  selected: readonly string[],
  id: string,
  checked: boolean,
  anchor?: string | null,
): string[] {
  const start = anchor ? visibleIds.indexOf(anchor) : -1;
  const end = visibleIds.indexOf(id);
  const ids =
    start >= 0 && end >= 0
      ? visibleIds.slice(Math.min(start, end), Math.max(start, end) + 1)
      : [id];
  const next = new Set(selected);
  for (const row of ids) {
    if (checked) next.add(row);
    else next.delete(row);
  }
  return [...next];
}
