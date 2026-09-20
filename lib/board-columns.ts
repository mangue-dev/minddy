import type { StatusMeta } from "@/lib/issue-constants";
import type { Issue } from "@/lib/types";

export interface BoardColumn {
  status: StatusMeta;
  items: Issue[];
}

/** A comparator built per column — the smart sort needs the column's own
 * issue set (the triage rules group objectives over it), the other sorts
 * ignore it. */
export type ColumnComparatorFactory = (
  columnIssues: Issue[]
) => (a: Issue, b: Issue) => number;

/** Group issues in one pass, then sort only the populated board columns. */
export function buildBoardColumns(
  statuses: StatusMeta[],
  issues: Issue[],
  makeComparator: ColumnComparatorFactory
): BoardColumn[] {
  const itemsByStatus = new Map(statuses.map((status) => [status.value, [] as Issue[]]));
  for (const issue of issues) itemsByStatus.get(issue.status)?.push(issue);
  return statuses.map((status) => {
    const items = itemsByStatus.get(status.value) ?? [];
    if (items.length > 1) items.sort(makeComparator(items));
    return { status, items };
  });
}

function sameItems(a: Issue[], b: Issue[]) {
  return a.length === b.length && a.every((issue, index) => issue === b[index]);
}

/**
 * Keep unchanged column objects and item arrays referentially stable so a
 * memoized column does not rerender when an issue in another status changes.
 */
export function createBoardColumnsBuilder() {
  let previous = new Map<string, BoardColumn>();
  return (
    statuses: StatusMeta[],
    issues: Issue[],
    makeComparator: ColumnComparatorFactory
  ) => {
    const next = buildBoardColumns(statuses, issues, makeComparator).map((column) => {
      const before = previous.get(column.status.value);
      return before &&
        before.status === column.status &&
        sameItems(before.items, column.items)
        ? before
        : column;
    });
    previous = new Map(next.map((column) => [column.status.value, column]));
    return next;
  };
}
