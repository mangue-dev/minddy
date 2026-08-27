/**
 * The dnd-kit settings shared by the two boards: drag activation, collision
 * detection, and the absence of misleading card shifts during the gesture.
 *
 * ## `boardCollision` — the pointer chooses only the column
 *
 * `closestCorners` (the previous setting) measures corners. Near the middle of
 * a board, a card in the neighboring column can therefore beat the card under
 * the pointer. In a gutter or below the last card, the large column rectangle
 * can also win and make the drop marker jump to the end of the column.
 *
 * Detection therefore runs in this order:
 *
 * 1. the column under the pointer;
 * 2. a horizontal gutter inside the card area → the nearest column;
 * 3. outside the columns' vertical content band → no target.
 *
 * Cards deliberately are not droppables. Registering every card made dnd-kit
 * synchronously measure the entire board at activation and publish every
 * hovered card through React context. The board resolves the insertion point
 * from its own visible card nodes only when manual ordering needs it.
 */

import {
  closestCorners,
  pointerWithin,
  type ClientRect,
  type CollisionDetection,
  type DropAnimation,
  type Modifier,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { STATUSES } from "@/lib/issue-constants";

const STATUS_IDS = new Set<string>(STATUSES.map((s) => s.value));

/**
 * Preserve click-to-open while making the drag react to the first deliberate
 * mouse movement. The previous six-pixel dead zone made the overlay feel as if
 * it had missed its first frames.
 */
export const BOARD_MOUSE_ACTIVATION_DISTANCE = 1;

const CARD_SELECTOR = "[data-issue-id]";
const COLUMN_SCROLLER_SELECTOR = "[data-board-column-scroller]";
const DRAG_BOUNDS_INSET_PX = 1;
const DROP_COMMIT_TIMEOUT_MS = 500;

type PendingDrop = {
  activeId: string;
  animation: Animation | null;
  animationStarted: boolean;
  committed: Promise<boolean>;
  expectedPosition: number;
  expectedStatus: string;
  finish: () => void;
  hideCommittedTarget: ((node: HTMLElement | undefined) => void) | null;
  resolve: (committed: boolean) => void;
  settled: boolean;
  timeout: ReturnType<typeof setTimeout>;
  visualTarget: BoardDropVisualTarget | null;
};

export type BoardDropVisualTarget = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export type BoardDropAnimationCoordinator = {
  animation: DropAnimation;
  cancel: () => void;
  layoutCommitted: (
    getIssue: (id: string) => {
      id: string;
      position: number;
      status: string;
    } | null,
  ) => void;
  prepare: (
    destination: {
      activeId: string;
      position: number;
      status: string;
      visualTarget?: BoardDropVisualTarget | null;
    },
    onFinish?: () => void,
  ) => void;
};

function findIssueNode(activeId: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(CARD_SELECTOR)).find(
    (node) => node.dataset.issueId === activeId,
  );
}

function stripInteractiveIdentity(root: HTMLElement) {
  const nodes = [root, ...root.querySelectorAll<HTMLElement>("*")];
  for (const node of nodes) {
    node.removeAttribute("id");
    node.removeAttribute("data-issue-id");
    node.removeAttribute("tabindex");
    node.removeAttribute("role");
    for (const attribute of Array.from(node.attributes)) {
      if (attribute.name.startsWith("aria-")) {
        node.removeAttribute(attribute.name);
      }
    }
  }
}

/** Capture the already-painted card instead of mounting its interactive tree again. */
export function captureBoardDragPreview(activeId: string) {
  const source = findIssueNode(activeId);
  if (!source) return null;
  const preview = source.cloneNode(true) as HTMLElement;
  stripInteractiveIdentity(preview);
  preview.classList.remove("opacity-40");
  preview.classList.add("pointer-events-none");
  return preview.outerHTML;
}

export type BoardDragBounds = Pick<
  ClientRect,
  "left" | "right" | "top" | "bottom"
>;

/** Read the visible card viewport once when the gesture activates. */
export function measureBoardDragBounds(
  board: HTMLElement | null,
): BoardDragBounds | null {
  if (!board) return null;
  const boardRect = board.getBoundingClientRect();
  const columnRects = Array.from(
    board.querySelectorAll<HTMLElement>(COLUMN_SCROLLER_SELECTOR),
    (node) => node.getBoundingClientRect(),
  );
  if (columnRects.length === 0) return boardRect;
  return {
    left: boardRect.left,
    right: boardRect.right,
    top: Math.max(boardRect.top, Math.min(...columnRects.map((r) => r.top))),
    bottom: Math.min(
      boardRect.bottom,
      Math.max(...columnRects.map((r) => r.bottom)),
    ),
  };
}

/**
 * Resolve the already-rendered drop marker to the card rectangle that will
 * occupy its slot. This lets the overlay start landing before React Query
 * publishes the optimistic cache update.
 */
export function measureBoardDropVisualTarget({
  activeId,
  activeIds,
  bounds,
  status,
}: {
  activeId: string;
  activeIds: Iterable<string>;
  bounds: BoardDragBounds | null;
  status: string;
}): BoardDropVisualTarget | null {
  const source = findIssueNode(activeId);
  const column = Array.from(
    document.querySelectorAll<HTMLElement>(COLUMN_SCROLLER_SELECTOR),
  ).find((node) => node.dataset.boardColumnStatus === status);
  const marker = column?.querySelector<HTMLElement>(
    "[data-board-drop-indicator]",
  );
  const anchor = marker?.nextElementSibling as HTMLElement | null;
  if (!source || !column || !marker) return null;

  const sourceRect = source.getBoundingClientRect();
  const columnRect = column.getBoundingClientRect();
  const columnStyle = getComputedStyle(column);
  const gap = Number.parseFloat(columnStyle.rowGap) || 0;
  const previous = marker.previousElementSibling as HTMLElement | null;
  const previousRect = previous?.getBoundingClientRect();
  const anchorRect = anchor?.getBoundingClientRect();
  const paddingLeft = Number.parseFloat(columnStyle.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(columnStyle.paddingRight) || 0;
  const paddingTop = Number.parseFloat(columnStyle.paddingTop) || 0;
  const slotTop =
    anchorRect?.top ??
    (previousRect ? previousRect.bottom + gap : columnRect.top + paddingTop);
  let top = slotTop;
  const orderedIds = Array.from(activeIds);

  // Cards from the target column that sit before the marker leave their old
  // slots before the bundle is inserted, so remove that occupied height.
  for (const issueId of orderedIds) {
    const node = findIssueNode(issueId);
    if (!node || node.closest(COLUMN_SCROLLER_SELECTOR) !== column) continue;
    const rect = node.getBoundingClientRect();
    if (rect.top < slotTop) top -= rect.height + gap;
  }

  // The overlay represents the held card, which may not be first in a
  // multi-card bundle. Add the preceding bundle cards back at the new slot.
  const activeIndex = Math.max(0, orderedIds.indexOf(activeId));
  for (const issueId of orderedIds.slice(0, activeIndex)) {
    const rect = findIssueNode(issueId)?.getBoundingClientRect();
    top += (rect?.height ?? sourceRect.height) + gap;
  }

  const width =
    anchorRect?.width ||
    previousRect?.width ||
    columnRect.width - paddingLeft - paddingRight ||
    sourceRect.width;
  const height = sourceRect.height;
  let left =
    anchorRect?.left ?? previousRect?.left ?? columnRect.left + paddingLeft;
  if (bounds) {
    left = Math.min(
      Math.max(left, bounds.left + DRAG_BOUNDS_INSET_PX),
      bounds.right - width - DRAG_BOUNDS_INSET_PX,
    );
    top = Math.min(
      Math.max(top, bounds.top + DRAG_BOUNDS_INSET_PX),
      bounds.bottom - height - DRAG_BOUNDS_INSET_PX,
    );
  }
  return { height, left, top, width };
}

/** Measure the exact space occupied by a dragged bundle in its target stack. */
export function measureBoardDropBundleHeight({
  activeIds,
  status,
}: {
  activeIds: Iterable<string>;
  status: string;
}): number | null {
  const column = Array.from(
    document.querySelectorAll<HTMLElement>(COLUMN_SCROLLER_SELECTOR),
  ).find((node) => node.dataset.boardColumnStatus === status);
  if (!column) return null;
  const heights = Array.from(
    activeIds,
    (id) => findIssueNode(id)?.getBoundingClientRect().height,
  ).filter((height): height is number => height != null && height > 0);
  if (heights.length === 0) return null;
  const gap = Number.parseFloat(getComputedStyle(column).rowGap) || 0;
  return (
    heights.reduce((total, height) => total + height, 0) +
    gap * Math.max(0, heights.length - 1)
  );
}

/** Keep the fixed overlay inside the cached board viewport without layout reads. */
export function createBoardBoundsModifier(bounds: {
  current: BoardDragBounds | null;
}): Modifier {
  return ({ transform, draggingNodeRect }) => {
    const limit = bounds.current;
    if (!limit || !draggingNodeRect) return transform;
    const next = { ...transform };
    const minLeft = limit.left + DRAG_BOUNDS_INSET_PX;
    const maxRight = limit.right - DRAG_BOUNDS_INSET_PX;
    const minTop = limit.top + DRAG_BOUNDS_INSET_PX;
    const maxBottom = limit.bottom - DRAG_BOUNDS_INSET_PX;
    const left = draggingNodeRect.left + next.x;
    const right = draggingNodeRect.right + next.x;
    const top = draggingNodeRect.top + next.y;
    const bottom = draggingNodeRect.bottom + next.y;
    if (left < minLeft) next.x += minLeft - left;
    if (right > maxRight) next.x -= right - maxRight;
    if (top < minTop) next.y += minTop - top;
    if (bottom > maxBottom) next.y -= bottom - maxBottom;
    return next;
  };
}

/**
 * Coordinate dnd-kit's retained overlay with the board's optimistic React
 * commit. React Query schedules subscriber notifications asynchronously, so a
 * fixed number of animation frames can still observe the source node under
 * load. The board explicitly signals the layout effect that measured the
 * destination instead.
 */
export function createBoardDropAnimation(): BoardDropAnimationCoordinator {
  let pending: PendingDrop | null = null;

  const settle = (entry: PendingDrop | null, committed: boolean) => {
    if (!entry || entry.settled) return;
    entry.settled = true;
    clearTimeout(entry.timeout);
    entry.resolve(committed);
    // With an immediate marker target, the animation owns the visible landing
    // and waits on this promise before releasing its placeholder. It must be
    // the only path that calls `finish`, otherwise the real card can appear
    // while the surrounding FLIP clones are still moving.
    if (entry.visualTarget) {
      if (!committed && !entry.animationStarted) {
        entry.finish();
        if (pending === entry) pending = null;
      }
      return;
    }
    if (committed) {
      entry.timeout = setTimeout(() => {
        entry.finish();
        if (pending === entry) pending = null;
      }, DROP_COMMIT_TIMEOUT_MS);
    } else {
      entry.finish();
      if (pending === entry) pending = null;
    }
  };

  const cancel = () => {
    const entry = pending;
    if (!entry) return;
    clearTimeout(entry.timeout);
    if (!entry.settled) {
      entry.settled = true;
      entry.resolve(false);
    }
    entry.animation?.cancel();
    entry.finish();
    if (pending === entry) pending = null;
  };

  const prepare = (
    destination: {
      activeId: string;
      position: number;
      status: string;
      visualTarget?: BoardDropVisualTarget | null;
    },
    onFinish = () => {},
  ) => {
    cancel();
    let resolve!: (committed: boolean) => void;
    const committed = new Promise<boolean>((done) => {
      resolve = done;
    });
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      onFinish();
    };
    const entry = {
      activeId: destination.activeId,
      animation: null,
      animationStarted: false,
      committed,
      expectedPosition: destination.position,
      expectedStatus: destination.status,
      finish,
      hideCommittedTarget: null,
      resolve,
      settled: false,
      timeout: setTimeout(
        () => settle(entry, false),
        destination.visualTarget ? 2_000 : DROP_COMMIT_TIMEOUT_MS,
      ),
      visualTarget: destination.visualTarget ?? null,
    } satisfies PendingDrop;
    pending = entry;
  };

  const layoutCommitted = (
    getIssue: (id: string) => {
      id: string;
      position: number;
      status: string;
    } | null,
  ) => {
    const entry = pending;
    const issue = entry ? getIssue(entry.activeId) : null;
    if (
      !entry ||
      !issue ||
      issue.id !== entry.activeId ||
      issue.status !== entry.expectedStatus ||
      issue.position !== entry.expectedPosition
    ) {
      return;
    }
    entry.hideCommittedTarget?.(findIssueNode(entry.activeId));
    settle(entry, true);
  };

  const animation: DropAnimation = async ({
    active,
    dragOverlay,
    transform,
  }) => {
    const activeId = String(active.id);
    const entry = pending?.activeId === activeId ? pending : null;
    if (!entry) return;
    entry.animationStarted = true;
    const hiddenNodes = new Map<HTMLElement, string>();
    const hide = (node: HTMLElement | undefined) => {
      if (!node || hiddenNodes.has(node)) return;
      hiddenNodes.set(node, node.style.visibility);
      node.style.visibility = "hidden";
    };
    entry.hideCommittedTarget = hide;

    hide(findIssueNode(activeId));
    try {
      const overlayRect = dragOverlay.node.getBoundingClientRect();
      let targetRect = entry.visualTarget;
      if (!targetRect) {
        if (!(await entry.committed)) return;
        const target = findIssueNode(activeId);
        hide(target);
        if (!target) return;
        const previousTransform = target.style.transform;
        target.style.transform = "none";
        targetRect = target.getBoundingClientRect();
        target.style.transform = previousTransform;
      }
      const finalTransform = {
        ...transform,
        x: transform.x + targetRect.left - overlayRect.left,
        y: transform.y + targetRect.top - overlayRect.top,
        scaleX:
          overlayRect.width > 0
            ? transform.scaleX * (targetRect.width / overlayRect.width)
            : 1,
        scaleY:
          overlayRect.height > 0
            ? transform.scaleY * (targetRect.height / overlayRect.height)
            : 1,
      };

      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        try {
          const landing = dragOverlay.node.animate(
            [
              { transform: CSS.Transform.toString(transform) },
              { transform: CSS.Transform.toString(finalTransform) },
            ],
            {
              duration: 180,
              easing: "cubic-bezier(0.2, 0, 0, 1)",
              fill: "forwards",
            },
          );
          entry.animation = landing;
          await landing.finished;
        } catch {
          // A newer drag or unmount can cancel WAAPI. Visibility still belongs
          // to this coordinator and is restored in the outer finally block.
        }
      }
      if (entry.visualTarget && !entry.settled) {
        await entry.committed;
      }
    } finally {
      for (const [node, visibility] of hiddenNodes) {
        node.style.visibility = visibility;
      }
      clearTimeout(entry.timeout);
      entry.animation = null;
      entry.hideCommittedTarget = null;
      entry.finish();
      if (pending === entry) pending = null;
    }
  };

  return { animation, cancel, layoutCommitted, prepare };
}

type RectBounds = Pick<ClientRect, "left" | "right" | "top" | "bottom">;

function containsPoint(rect: RectBounds, point: { x: number; y: number }) {
  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  );
}

function columnBounds(
  columns: Parameters<CollisionDetection>[0]["droppableContainers"],
  rects: Parameters<CollisionDetection>[0]["droppableRects"],
): RectBounds | null {
  const measured = columns
    .map((column) => rects.get(column.id))
    .filter((rect): rect is ClientRect => rect != null);
  if (measured.length === 0) return null;
  return {
    left: Math.min(...measured.map((rect) => rect.left)),
    right: Math.max(...measured.map((rect) => rect.right)),
    top: Math.min(...measured.map((rect) => rect.top)),
    bottom: Math.max(...measured.map((rect) => rect.bottom)),
  };
}

function detectBoardCollision(args: Parameters<CollisionDetection>[0]) {
  // Resolve one of the handful of columns. Cards are intentionally absent
  // from the droppable registry, keeping both activation and pointer movement
  // independent of the number of issues on the board.
  const columns = args.droppableContainers.filter((container) =>
    STATUS_IDS.has(String(container.id)),
  );
  const column = pointerWithin({
    ...args,
    droppableContainers: columns,
  })[0];
  const pointer = args.pointerCoordinates;
  const bounds = columnBounds(columns, args.droppableRects);
  if (pointer && bounds && !containsPoint(bounds, pointer)) return [];
  // dnd-kit algorithms return all sorted targets, while consumers only read
  // the first one (`getFirstCollision`). Return only the intended target.
  const nearestColumn =
    column ?? closestCorners({ ...args, droppableContainers: columns })[0];
  if (!nearestColumn) return [];

  return [nearestColumn];
}

export const boardCollision: CollisionDetection = (args) =>
  detectBoardCollision(args);
