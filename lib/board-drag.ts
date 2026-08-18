/**
 * What a drag and drop moves on a board, when a selection is in progress.
 *
 * Two rules, and they fit in one sentence each:
 *
 * - **We ship the selection** as soon as the card entered is part of it. Enter
 * a card OUTSIDE the selection moves only it — the selection stays where it is,
 * like on a desk: we do not lose thirty sorted tickets because we have
 * grabbed the thirty-first.
 *
 * - **The deck keeps its reading order.** The tickets land in
 * the order in which they were on the screen (columns from left to right, cards from top
 * to bottom), not in the order in which the selection `Set` encountered them — which,
 * depends on the order of ⇧-clicks and wants nothing say.
 *
 * The positions are calculated only once for the entire packet: we divide
 * the interval between the two neighbors of the drop-off point into as many parts as there are
 * tickets. Passing them one by one through the calculation to two neighbors the
 * would all stack on the same value.
 *
 * And a third, which is not position calculation but its counterpart to
 * the screen: **we show the arrival point, we cannot guess it.** `previewBoardMove`
 * derives the drop mark from ALREADY planned moves, then replays the sort
 * display of the target column. The line we see while dragging is therefore
 * calculated by the same code as the writing that follows — including when the column
 * is sorted by priority or by date, where the card does not land under the cursor
 * but where the sort puts it.
 */

import { STATUSES, type IssueStatus } from "@/lib/issue-constants";
import type { Issue } from "@/lib/types";

const STATUS_IDS = new Set<string>(STATUSES.map((s) => s.value));

/** Display rank of each ticket on the board (columns then cards). */
export function displayRank(columns: { items: Issue[] }[]): Map<string, number> {
  const rank = new Map<string, number>();
  let n = 0;
  for (const column of columns) {
    for (const issue of column.items) rank.set(issue.id, n++);
  }
  return rank;
}

/**
 * The tickets that a swipe carries: the selection if the card entered is part of it, this card alone otherwise. Rendered in board display order.
 */
export function dragBundle(
  activeId: string,
  selectedIds: Set<string>,
  issueById: Map<string, Issue>,
  rank: Map<string, number>
): Issue[] {
  const active = issueById.get(activeId);
  if (!active) return [];
  if (!selectedIds.has(activeId) || selectedIds.size < 2) return [active];
  const bundle = Array.from(selectedIds, (id) => issueById.get(id)).filter(
    (issue): issue is Issue => issue !== undefined
  );
  return bundle.sort(
    (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)
  );
}

/** The rectangle of a drag item, collapsed to whatever the insertion point reads. */
export interface DragRect {
  top: number;
  height: number;
}

/** Where the deposit would land, as the current gesture designates. */
export interface DropTarget {
  status: IssueStatus;
  /** The hovered card, `null` when it is the bottom of the column. */
  overIssueId: string | null;
  /** The insertion point is AFTER the hovered map, not before. */
  after: boolean;
}

/**
 * What the gesture designates: a column, a card, and which side of it
 * card.
 *
 * **The side is the half that was missing.** Without it, hovering over a card would always say "before it" — the last place in a column becomes
 * unattainable other than by aiming at the gap under the last card, and the
 * deposit marker jumps a notch from what the hand is aiming for. We compare
 * therefore the CENTERS: that of the held card (the original rectangle translated
 * by dragging, what dnd-kit calls `active.rect.current.translated`) against
 * that of the hovered card.
 */
export function readDropTarget({
  overId,
  overRect,
  activeRect,
  issueById,
}: {
  overId: string | number | null | undefined;
  overRect: DragRect | null | undefined;
  activeRect: DragRect | null | undefined;
  issueById: Map<string, Issue>;
}): DropTarget | null {
  if (overId == null) return null;
  const id = String(overId);
  if (STATUS_IDS.has(id)) {
    return { status: id as IssueStatus, overIssueId: null, after: false };
  }
  const over = issueById.get(id);
  if (!over) return null;
  const after =
    !!activeRect &&
    !!overRect &&
    activeRect.top + activeRect.height / 2 >= overRect.top + overRect.height / 2;
  return { status: over.status, overIssueId: over.id, after };
}

/** `count` positions distributed between the two neighbors of the insertion point. */
function spreadPositions(
  before: Issue | undefined,
  after: Issue | undefined,
  count: number
): number[] {
  if (!before && !after) return Array.from({ length: count }, (_, k) => k);
  if (!before) return Array.from({ length: count }, (_, k) => after!.position - count + k);
  if (!after) return Array.from({ length: count }, (_, k) => before.position + 1 + k);
  const step = (after.position - before.position) / (count + 1);
  return Array.from({ length: count }, (_, k) => before.position + step * (k + 1));
}

export interface PlannedMove {
  issue: Issue;
  patch: { status?: IssueStatus; position: number };
}

/**
 * The move to write for each ticket in the package. Blank = nothing to do
 * (deposit without effect), in which case the caller writes nothing at all.
 */
export function planBoardMove({
  bundle,
  targetStatus,
  overIssueId,
  dropAfter = false,
  columnItems,
  manual,
  now,
}: {
  /** The slipped packet, in the order it should land. */
  bundle: Issue[];
  targetStatus: IssueStatus;
  /** The card hovered over the deposit, `null` if dropped at the bottom of the column. */
  overIssueId: string | null;
  /** The deposit targets the LOWER half of the hovered card: we insert
 after it (see `readDropTarget`). Without it, the end of a column is unattainable. */
  dropAfter?: boolean;
  /** The entire target column, sorted by position — including the package. */
  columnItems: Issue[];
  /** Manual sorting: only case where the order in a column is reordered. */
  manual: boolean;
  /** Base timestamp for sorting by field (position there is cosmetic). */
  now: number;
}): PlannedMove[] {
  const moving = manual
    ? bundle
    : // Except for manual sorting, the order of a column is derived from a field: a ticket
      // already in the target column has nothing to change.
      bundle.filter((issue) => issue.status !== targetStatus);
  if (moving.length === 0) return [];

  if (!manual) {
    return moving.map((issue, k) => ({
      issue,
      patch: { status: targetStatus, position: now + k },
    }));
  }

  const movingIds = new Set(moving.map((i) => i.id));
  const rest = columnItems.filter((i) => !movingIds.has(i.id));
  // The insertion point is read on the COMPLETE column (the hovered map can
  // be part of the package), then translates into an index among the remaining tickets.
  const overIndex = overIssueId
    ? columnItems.findIndex((i) => i.id === overIssueId)
    : -1;
  let index: number;
  if (overIndex < 0) {
    index = rest.length;
  } else {
    const before = columnItems
      .slice(0, overIndex)
      .filter((i) => !movingIds.has(i.id)).length;
    // “After” only makes sense if the hovered card remains in place: a card
    // of the package does not count as a neighbor, she leaves with it.
    index = before + (dropAfter && !movingIds.has(overIssueId!) ? 1 : 0);
  }

  const positions = spreadPositions(rest[index - 1], rest[index], moving.length);
  return moving.map((issue, k) => ({
    issue,
    patch:
      issue.status === targetStatus
        ? { position: positions[k] }
        : { status: targetStatus, position: positions[k] },
  }));
}

/** The deposit mark to draw: a line, in a column, in a place. */
export interface DropPreview {
  status: IssueStatus;
  /** The line is drawn BEFORE this card; `null` = at the end of the column. */
  beforeIssueId: string | null;
  /** How many tickets will land there (the packet). */
  count: number;
}

/**
 * Where the package will land, such that the column WILL DISPLAY it.
 *
 * We do not rededuce anything from the cursor: we apply the already planned patches to a
 * copy of the target column, we replay its display sort, and we read the place
 * obtained. This is what makes the mark fair in a column sorted by priority
 * or by date, where the drop point owes nothing to the cursor — the ticket falls there
 * where the field stores it, sometimes ten cards from the targeted point.
 *
 * The line is anchored on a card THAT REMAINS: under manual sorting, the deck is
 * still displayed in the column while dragging, and anchoring to it would cause
 * to run the marker behind its own target.
 *
 * `null` = nothing to show, because there is nothing to write (drop without effect).
 */
export function previewBoardMove({
  moves,
  displayItems,
  comparator,
}: {
  /** Moves planned by `planBoardMove` — empty, there is no marker. */
  moves: PlannedMove[];
  /** The target column as it is displayed (so already sorted for the screen). */
  displayItems: Issue[];
  /** The display sort of this column. */
  comparator: (a: Issue, b: Issue) => number;
}): DropPreview | null {
  if (moves.length === 0) return null;
  const movingIds = new Set(moves.map((m) => m.issue.id));
  const status = moves[0].patch.status ?? moves[0].issue.status;
  const rest = displayItems.filter((i) => !movingIds.has(i.id));
  // The sorting is stable: for equal value, a card in place keeps pace with one
  // card that arrives — the marker is therefore placed AFTER its ties, like sorting.
  const projected = [
    ...rest,
    ...moves.map((m) => ({ ...m.issue, ...m.patch }) as Issue),
  ].sort(comparator);

  const landing = projected.findIndex((i) => movingIds.has(i.id));
  if (landing < 0) return null;
  const restBefore = projected
    .slice(0, landing)
    .filter((i) => !movingIds.has(i.id)).length;
  return {
    status,
    beforeIssueId: rest[restBefore]?.id ?? null,
    count: moves.length,
  };
}

/** Two identical marks — to only re-set the board when it moves. */
export function sameDropPreview(
  a: DropPreview | null,
  b: DropPreview | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.status === b.status &&
    a.beforeIssueId === b.beforeIssueId &&
    a.count === b.count
  );
}
