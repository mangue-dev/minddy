/**
 * The two dnd-kit settings that the two boards share: WHO is hovered over, and
 * what cards can animate.
 *
 * ## `boardCollision` — the pointer chooses the column, the column chooses the card
 *
 * `closestCorners` (the previous setting) measures corners: in the middle of a board,
 * the corners of a card in the NEIGHBOR column can be closer than those
 * of the card being hovered over, and the hover starts next to it. Worse, between two cards
 * or under the last one, it is the large rectangle in the column that wins — the target
 * then falls back to the end of the column, and the deposit marker jumps.
 *
 * Hence three times, in this order:
 *
 * 1. a card under the pointer → that's it, without discussion;
 * 2. otherwise the column under the pointer, and in THIS column only, the card
 * in the nearest center (the void between two cards, or under the last one,
 * therefore designates its neighbor — and `readDropTarget` then says which side) ;
 * 3. pointer out of any column (gutter, headers) → `closestCorners`, which
 * always responds something.
 *
 * ## `NO_SHIFT_STRATEGY` — only one animation per move
 *
 * Cards no longer shift under the slipped packet. This offset was the
 * half of a duplicate: dnd-kit pushed cards by `transform` during the
 * drag, then the optimistic cache reordered the list at drop — two
 * animations for a single move, hence the jumps on arrival. And this
 * offset LIE as soon as the column was sorted by priority or by date: it
 * opened a hole under the cursor, where the sort was not going to put anything.
 *
 * What we see instead is the deposit marker
 * (`components/board-drop-indicator.tsx`), calculated by the same code as
 * the writing which follows (`previewBoardMove`).
 */

import {
  closestCenter,
  closestCorners,
  pointerWithin,
  type CollisionDetection,
} from "@dnd-kit/core";
import type { SortingStrategy } from "@dnd-kit/sortable";
import { STATUSES } from "@/lib/issue-constants";

const STATUS_IDS = new Set<string>(STATUSES.map((s) => s.value));

/** The column of a card, placed on its sortable so that detection can read it. */
export interface CardDragData {
  columnStatus: string;
}

export const boardCollision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  const card = within.find((c) => !STATUS_IDS.has(String(c.id)));
  if (card) return [card];

  const column = within.find((c) => STATUS_IDS.has(String(c.id)));
  // dnd-kit algorithms render ALL targets, sorted; only the
  // first account (`getFirstCollision`). We therefore only give back — what we
  // render here is what the repository will read.
  if (!column) return closestCorners(args).slice(0, 1);

  const cards = args.droppableContainers.filter(
    (c) =>
      !STATUS_IDS.has(String(c.id)) &&
      (c.data.current as CardDragData | undefined)?.columnStatus ===
        String(column.id)
  );
  if (cards.length === 0) return [column];
  const closest = closestCenter({ ...args, droppableContainers: cards });
  return closest.length > 0 ? [closest[0]] : [column];
};

/** No card moves during dragging (see the header of this file). */
export const NO_SHIFT_STRATEGY: SortingStrategy = () => null;

/**
 * And none replays its journey AFTER the deposit: the optimistic cache has already
 * replaced it. This was the second half of the duplicate — and, incidentally, what made
 * measure one rectangle per card each time the list was changed.
 */
export const NO_LAYOUT_ANIMATION = () => false;
