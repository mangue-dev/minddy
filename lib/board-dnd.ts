/**
 * The dnd-kit settings shared by the two boards: drag activation, collision
 * detection, and the absence of misleading card shifts during the gesture.
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
  type DropAnimation,
} from "@dnd-kit/core";
import type { SortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { STATUSES } from "@/lib/issue-constants";

const STATUS_IDS = new Set<string>(STATUSES.map((s) => s.value));

/** The column of a card, placed on its sortable so that detection can read it. */
export interface CardDragData {
  columnStatus: string;
}

/**
 * Preserve click-to-open while making the drag react to the first deliberate
 * mouse movement. The previous six-pixel dead zone made the overlay feel as if
 * it had missed its first frames.
 */
export const BOARD_MOUSE_ACTIVATION_DISTANCE = 1;

/**
 * Land the fixed drag overlay on the card's optimistic destination. Animating
 * the destination card itself would keep the transition inside its column's
 * scroll clip, hiding the part of a cross-column journey between A and B.
 */
export const BOARD_DROP_ANIMATION: DropAnimation = async ({
  active,
  dragOverlay,
  transform,
}) => {
  const activeId = String(active.id);
  const findTarget = () =>
    Array.from(
      document.querySelectorAll<HTMLElement>("[data-issue-id]")
    ).find((node) => node.dataset.issueId === activeId);
  const hiddenNodes = new Map<HTMLElement, string>();
  const hide = (node: HTMLElement | undefined) => {
    if (!node || hiddenNodes.has(node)) return;
    hiddenNodes.set(node, node.style.visibility);
    node.style.visibility = "hidden";
  };

  // Hide the source immediately. At the next two frame boundaries, hide the
  // committed destination before it can paint and then measure its final slot.
  // Cross-column React reconciliation may replace the DOM node entirely.
  hide(findTarget());
  let target: HTMLElement | undefined;
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      hide(findTarget());
      requestAnimationFrame(() => {
        target = findTarget();
        hide(target);
        resolve();
      });
    });
  });
  if (!target) {
    for (const [node, visibility] of hiddenNodes) {
      node.style.visibility = visibility;
    }
    return;
  }

  const previousTransform = target.style.transform;
  // A same-column reorder may already have a Framer layout transform. Measure
  // the committed slot, not an intermediate frame of that separate animation.
  target.style.transform = "none";
  const overlayRect = dragOverlay.node.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  target.style.transform = previousTransform;
  const finalTransform = {
    ...transform,
    x: transform.x + targetRect.left - overlayRect.left,
    y: transform.y + targetRect.top - overlayRect.top,
    scaleX:
      overlayRect.width > 0 ? transform.scaleX * (targetRect.width / overlayRect.width) : 1,
    scaleY:
      overlayRect.height > 0
        ? transform.scaleY * (targetRect.height / overlayRect.height)
        : 1,
  };

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  try {
    if (!reducedMotion) {
      await dragOverlay.node.animate(
        [
          { transform: CSS.Transform.toString(transform) },
          { transform: CSS.Transform.toString(finalTransform) },
        ],
        {
          duration: 180,
          easing: "cubic-bezier(0.2, 0, 0, 1)",
          fill: "forwards",
        }
      ).finished;
    }
  } finally {
    for (const [node, visibility] of hiddenNodes) {
      node.style.visibility = visibility;
    }
  }
};

export const boardCollision: CollisionDetection = (args) => {
  // Resolve one of the handful of columns first. Testing pointer containment
  // against every card on every mouse move made this path grow with the whole
  // board even though only one column can possibly matter.
  const columns = args.droppableContainers.filter((container) =>
    STATUS_IDS.has(String(container.id))
  );
  const column = pointerWithin({
    ...args,
    droppableContainers: columns,
  })[0];
  // dnd-kit algorithms render ALL targets, sorted; only the
  // first account (`getFirstCollision`). We therefore only give back — what we
  // render here is what the repository will read.
  const nearestColumn =
    column ??
    closestCorners({ ...args, droppableContainers: columns })[0];
  if (!nearestColumn) return [];

  const cards = args.droppableContainers.filter(
    (c) =>
      !STATUS_IDS.has(String(c.id)) &&
      (c.data.current as CardDragData | undefined)?.columnStatus ===
        String(nearestColumn.id)
  );
  if (cards.length === 0) return [nearestColumn];
  const card = pointerWithin({
    ...args,
    droppableContainers: cards,
  })[0];
  if (card) return [card];
  const closest = closestCenter({ ...args, droppableContainers: cards });
  return closest.length > 0 ? [closest[0]] : [nearestColumn];
};

/** No card moves during dragging (see the header of this file). */
export const NO_SHIFT_STRATEGY: SortingStrategy = () => null;
