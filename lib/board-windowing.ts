/** Small columns keep natural flow; large ones retain only their visible rows. */
export const BOARD_WINDOW_THRESHOLD = 16;
export const BOARD_WINDOW_OVERSCAN = 5;
/** A column's first commit mounts its visible rows and one neighbour. */
export const BOARD_WINDOW_INITIAL_OVERSCAN = 1;
/** Widen to the ordinary margin at idle, or after this delay under load. */
export const BOARD_WINDOW_WIDEN_TIMEOUT_MS = 200;
export const BOARD_ROW_GAP = 8;
export const BOARD_ROW_ESTIMATE = 220;

/** Interaction owners extend the visible range without retaining whole boards. */
export function boardWindowRange(
  visible: readonly number[],
  keys: readonly string[],
  pinned: ReadonlySet<string>,
): number[] {
  const indices = new Set(visible);
  keys.forEach((key, index) => {
    if (pinned.has(key)) indices.add(index);
  });
  return [...indices].sort((a, b) => a - b);
}

// Geometry belongs to the mounted column, never an account-independent cache.
const columnHeights = new WeakMap<HTMLElement, (id: string) => number | null>();

export function registerBoardRowHeights(
  column: HTMLElement,
  height: (id: string) => number | null,
): () => void {
  columnHeights.set(column, height);
  return () => {
    if (columnHeights.get(column) === height) columnHeights.delete(column);
  };
}

/** Offscreen bundle rows use the same bounded estimate as their scroll canvas. */
export function boardRowHeight(column: HTMLElement, id: string): number | null {
  return columnHeights.get(column)?.(id) ?? null;
}
