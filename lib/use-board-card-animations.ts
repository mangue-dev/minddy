"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import type { BoardColumn } from "@/lib/board-columns";

const CARD_SELECTOR = "[data-issue-id]";
const COLUMN_SCROLLER_SELECTOR = "[data-board-column-scroller]";
const MOVE_DURATION_MS = 180;
const SCROLL_IDLE_MS = 100;
const SKIP_WINDOW_MS = 1_000;

type CardSnapshot = {
  rect: DOMRect;
  clip: CardClip;
  layoutLeft: number;
  layoutTop: number;
};

type CardClip = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type CurrentCard = CardSnapshot & { node: HTMLElement };

type RunningAnimation = {
  animation: Animation;
  cleanup: () => void;
  clone: HTMLElement;
};

function cardClip(
  node: HTMLElement,
  boardRect: DOMRect,
  columnRects: Map<HTMLElement, DOMRect>,
): CardClip {
  const columnScroller = node.closest<HTMLElement>(COLUMN_SCROLLER_SELECTOR);
  let columnRect = columnScroller ? columnRects.get(columnScroller) : undefined;
  if (columnScroller && !columnRect) {
    columnRect = columnScroller.getBoundingClientRect();
    columnRects.set(columnScroller, columnRect);
  }
  return {
    left: boardRect.left,
    right: boardRect.right,
    top: Math.max(boardRect.top, columnRect?.top ?? boardRect.top),
    bottom: Math.min(boardRect.bottom, columnRect?.bottom ?? boardRect.bottom),
  };
}

function readCards(root: HTMLElement | null) {
  const cards = new Map<string, CurrentCard>();
  if (!root) return cards;
  const boardRect = root.getBoundingClientRect();
  const boardScrollLeft = root.scrollLeft;
  const columnRects = new Map<HTMLElement, DOMRect>();
  for (const node of root?.querySelectorAll<HTMLElement>(CARD_SELECTOR) ?? []) {
    const id = node.dataset.issueId;
    if (!id || node.hasAttribute("data-board-landing-source")) continue;
    const columnScroller = node.closest<HTMLElement>(COLUMN_SCROLLER_SELECTOR);
    const columnRect = columnScroller
      ? (columnRects.get(columnScroller) ??
        columnScroller.getBoundingClientRect())
      : boardRect;
    if (columnScroller && !columnRects.has(columnScroller)) {
      columnRects.set(columnScroller, columnRect);
    }
    const rect = node.getBoundingClientRect();
    cards.set(id, {
      node,
      rect,
      clip: cardClip(node, boardRect, columnRects),
      // Viewport coordinates change while either scroller moves. These content
      // coordinates do not, so a server echo during scroll is not mistaken for
      // a card reorder and animated back from the stale screen position.
      layoutLeft: rect.left - boardRect.left + boardScrollLeft,
      layoutTop:
        rect.top -
        columnRect.top +
        (columnScroller?.scrollTop ?? root.scrollTop),
    });
  }
  return cards;
}

function snapshots(cards: Map<string, CurrentCard>) {
  const result = new Map<string, CardSnapshot>();
  for (const [id, { rect, clip, layoutLeft, layoutTop }] of cards) {
    result.set(id, { rect, clip, layoutLeft, layoutTop });
  }
  return result;
}

function intersectsClip(rect: DOMRect, clip: CardClip) {
  return (
    rect.right > clip.left &&
    rect.left < clip.right &&
    rect.bottom > clip.top &&
    rect.top < clip.bottom
  );
}

function clampToClip(rect: DOMRect, clip: CardClip) {
  return {
    left: Math.min(
      Math.max(rect.left, clip.left),
      Math.max(clip.left, clip.right - rect.width),
    ),
    top: Math.min(
      Math.max(rect.top, clip.top),
      Math.max(clip.top, clip.bottom - rect.height),
    ),
  };
}

function removeDuplicateIds(root: HTMLElement) {
  root.removeAttribute("id");
  for (const node of root.querySelectorAll<HTMLElement>("[id]")) {
    node.removeAttribute("id");
  }
}

function animationViewport(boardRect: DOMRect, columnRects: Iterable<DOMRect>) {
  const columns = Array.from(columnRects);
  if (columns.length === 0) return boardRect;
  const top = Math.max(
    boardRect.top,
    Math.min(...columns.map((rect) => rect.top)),
  );
  const bottom = Math.min(
    boardRect.bottom,
    Math.max(...columns.map((rect) => rect.bottom)),
  );
  return {
    left: boardRect.left,
    right: boardRect.right,
    top,
    bottom,
    width: boardRect.width,
    height: Math.max(0, bottom - top),
  };
}

/**
 * Animate every card whose viewport position changed between two board layouts.
 *
 * Every moved card uses a clone in one fixed layer clipped to the visible board
 * rectangle. Columns cannot crop a cross-column journey, while the board layer
 * prevents cards from painting over app chrome such as either sidebar. A single
 * FLIP path keeps every move on the same timeline.
 */
export function useBoardCardAnimations(
  root: RefObject<HTMLElement | null>,
  columns: BoardColumn[],
  suspended = false,
  layoutSignal?: unknown,
) {
  const previousCards = useRef(new Map<string, CardSnapshot>());
  const skippedOnce = useRef(new Map<string, number>());
  const running = useRef(new Map<string, RunningAnimation>());
  const reducedMotion = useRef(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const register = useCallback(
    (
      id: string,
      animation: Animation,
      clone: HTMLElement,
      release: () => void,
    ) => {
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        release();
        if (running.current.get(id)?.animation === animation) {
          running.current.delete(id);
        }
      };
      running.current.set(id, { animation, cleanup, clone });
      animation.addEventListener("finish", cleanup, { once: true });
      animation.addEventListener("cancel", cleanup, { once: true });
    },
    [],
  );

  const cancelRunning = useCallback(() => {
    for (const entry of Array.from(running.current.values())) {
      entry.animation.cancel();
      entry.cleanup();
    }
  }, []);

  const cancelCard = useCallback((id: string) => {
    const entry = running.current.get(id);
    if (!entry) return null;
    const rect = entry.clone.getBoundingClientRect();
    entry.animation.cancel();
    entry.cleanup();
    return rect;
  }, []);

  const measure = useCallback(() => {
    previousCards.current = snapshots(readCards(root.current));
  }, [root]);

  const skipNext = useCallback((ids: Iterable<string>) => {
    const expiresAt = performance.now() + SKIP_WINDOW_MS;
    for (const id of ids) skippedOnce.current.set(id, expiresAt);
  }, []);

  const unskip = useCallback((ids: Iterable<string>) => {
    for (const id of ids) skippedOnce.current.delete(id);
  }, []);

  useLayoutEffect(() => {
    const board = root.current;
    if (!board) return;

    const previous = previousCards.current;
    const current = readCards(board);
    const boardRect = board.getBoundingClientRect();
    const columnRects = Array.from(
      board.querySelectorAll<HTMLElement>(COLUMN_SCROLLER_SELECTOR),
      (node) => node.getBoundingClientRect(),
    );
    const viewport = animationViewport(boardRect, columnRects);

    if (!reducedMotion.current && previous.size > 0) {
      const layer = document.createElement("div");
      Object.assign(layer.style, {
        position: "fixed",
        left: `${viewport.left}px`,
        top: `${viewport.top}px`,
        width: `${viewport.width}px`,
        height: `${viewport.height}px`,
        overflow: "hidden",
        pointerEvents: "none",
        isolation: "isolate",
        contain: "layout paint style",
        zIndex: "20",
      });
      const fragment = document.createDocumentFragment();
      const now = performance.now();
      const moves: Array<{
        id: string;
        clone: HTMLElement;
        target: HTMLElement;
        x: number;
        y: number;
        fromOpacity: string;
        toOpacity: string;
        previousVisibility: string;
      }> = [];

      for (const [id, to] of current) {
        if ((skippedOnce.current.get(id) ?? 0) >= now) continue;
        const from = previous.get(id);
        if (!from) continue;
        const fromVisible = intersectsClip(from.rect, from.clip);
        const toVisible = intersectsClip(to.rect, to.clip);
        if (!fromVisible && !toVisible) continue;

        // Never animate from the real coordinates of an off-screen card. A
        // long column or a distant horizontal status can put that rectangle
        // thousands of pixels away, forcing the compositor to allocate an
        // enormous transient surface. Enter or leave at the closest visible
        // edge instead, with opacity hiding the artificial endpoint.
        const fromPoint = fromVisible
          ? { left: from.rect.left, top: from.rect.top }
          : clampToClip(from.rect, from.clip);
        const toPoint = toVisible
          ? { left: to.rect.left, top: to.rect.top }
          : clampToClip(to.rect, to.clip);
        const layoutX = from.layoutLeft - to.layoutLeft;
        const layoutY = from.layoutTop - to.layoutTop;
        if (Math.abs(layoutX) < 0.5 && Math.abs(layoutY) < 0.5) {
          continue;
        }

        // An optimistic update is commonly followed by a realtime echo with
        // identical geometry. That echo must not cancel the flight already in
        // progress. Replace an animation only when this card actually moves
        // again.
        const interruptedRect = cancelCard(id);
        const visualFromPoint = interruptedRect
          ? { left: interruptedRect.left, top: interruptedRect.top }
          : fromPoint;
        const x = visualFromPoint.left - toPoint.left;
        const y = visualFromPoint.top - toPoint.top;

        const clone = to.node.cloneNode(true) as HTMLElement;
        removeDuplicateIds(clone);
        clone.removeAttribute("data-issue-id");
        clone.setAttribute("aria-hidden", "true");
        Object.assign(clone.style, {
          position: "absolute",
          left: `${toPoint.left - viewport.left}px`,
          top: `${toPoint.top - viewport.top}px`,
          width: `${to.rect.width}px`,
          height: `${to.rect.height}px`,
          margin: "0",
          opacity: "1",
          pointerEvents: "none",
          transformOrigin: "top left",
          transition: "none",
          visibility: "visible",
          zIndex: "0",
        });
        const previousVisibility = to.node.style.visibility;
        to.node.style.visibility = "hidden";
        fragment.appendChild(clone);
        moves.push({
          id,
          clone,
          target: to.node,
          x,
          y,
          fromOpacity: fromVisible ? "1" : "0",
          toOpacity: toVisible ? "1" : "0",
          previousVisibility,
        });
      }

      // One layer insertion avoids a style recalculation per crossing card and
      // forms a stacking context below both app sidebars (z-31 and z-40).
      if (moves.length > 0) {
        layer.appendChild(fragment);
        document.body.appendChild(layer);
      }
      for (const move of moves) {
        const animation = move.clone.animate(
          [
            {
              opacity: move.fromOpacity,
              transform: `translate3d(${move.x}px, ${move.y}px, 0)`,
            },
            { opacity: move.toOpacity, transform: "translate3d(0, 0, 0)" },
          ],
          {
            duration: MOVE_DURATION_MS,
            easing: "cubic-bezier(0.2, 0, 0, 1)",
            fill: "forwards",
          },
        );
        register(move.id, animation, move.clone, () => {
          move.target.style.visibility = move.previousVisibility;
          move.clone.remove();
          if (layer.childElementCount === 0) layer.remove();
        });
      }
    }

    for (const [id, expiresAt] of skippedOnce.current) {
      if (expiresAt < performance.now()) skippedOnce.current.delete(id);
    }
    previousCards.current = snapshots(current);
  }, [cancelCard, columns, layoutSignal, register, root]);

  useEffect(() => {
    const board = root.current;
    if (!board) return;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateReducedMotion = () => {
      reducedMotion.current = motionQuery.matches;
    };
    updateReducedMotion();
    motionQuery.addEventListener("change", updateReducedMotion);
    const refreshAfterInteraction = () => {
      // Fixed clones cannot follow native scrolling. Reveal the real cards on
      // the first scroll frame so every card remains attached to its column.
      cancelRunning();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (suspended) {
        refreshTimer.current = null;
        return;
      }
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null;
        measure();
      }, SCROLL_IDLE_MS);
    };
    board.addEventListener("scroll", refreshAfterInteraction, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", refreshAfterInteraction, {
      passive: true,
    });
    return () => {
      board.removeEventListener("scroll", refreshAfterInteraction, true);
      window.removeEventListener("resize", refreshAfterInteraction);
      motionQuery.removeEventListener("change", updateReducedMotion);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      cancelRunning();
    };
  }, [cancelRunning, measure, root, suspended]);

  return { cancel: cancelRunning, measure, skipNext, unskip };
}
