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
const MOVE_DURATION_MS = 180;
const SCROLL_IDLE_MS = 100;
const SKIP_WINDOW_MS = 500;

type CardSnapshot = {
  rect: DOMRect;
};

type CurrentCard = CardSnapshot & { node: HTMLElement };

type RunningAnimation = {
  animation: Animation;
  cleanup: () => void;
};

function readCards(root: HTMLElement | null) {
  const cards = new Map<string, CurrentCard>();
  for (const node of root?.querySelectorAll<HTMLElement>(CARD_SELECTOR) ?? []) {
    const id = node.dataset.issueId;
    if (!id) continue;
    cards.set(id, {
      node,
      rect: node.getBoundingClientRect(),
    });
  }
  return cards;
}

function snapshots(cards: Map<string, CurrentCard>) {
  const result = new Map<string, CardSnapshot>();
  for (const [id, { rect }] of cards) result.set(id, { rect });
  return result;
}

function intersectsViewport(rect: DOMRect, viewport: DOMRect) {
  return (
    rect.right > viewport.left &&
    rect.left < viewport.right &&
    rect.bottom > viewport.top &&
    rect.top < viewport.bottom
  );
}

function removeDuplicateIds(root: HTMLElement) {
  root.removeAttribute("id");
  for (const node of root.querySelectorAll<HTMLElement>("[id]")) {
    node.removeAttribute("id");
  }
}

/**
 * Animate every card whose viewport position changed between two board layouts.
 *
 * Every moved card uses a fixed clone under `document.body`, where neither
 * column can clip it. A single FLIP path keeps source shifts, destination
 * shifts, and cross-column moves on the same timeline. Scroll and resize
 * tracking remains idle-debounced to avoid measuring on every scroll frame.
 */
export function useBoardCardAnimations(
  root: RefObject<HTMLElement | null>,
  columns: BoardColumn[]
) {
  const previousCards = useRef(new Map<string, CardSnapshot>());
  const skippedOnce = useRef(new Map<string, number>());
  const running = useRef(new Map<string, RunningAnimation>());
  const reducedMotion = useRef(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const register = useCallback(
    (id: string, animation: Animation, release: () => void) => {
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        release();
        if (running.current.get(id)?.animation === animation) {
          running.current.delete(id);
        }
      };
      running.current.set(id, { animation, cleanup });
      animation.addEventListener("finish", cleanup, { once: true });
      animation.addEventListener("cancel", cleanup, { once: true });
    },
    []
  );

  const cancelRunning = useCallback(() => {
    for (const entry of Array.from(running.current.values())) {
      entry.animation.cancel();
      entry.cleanup();
    }
  }, []);

  const cancelCard = useCallback((id: string) => {
    const entry = running.current.get(id);
    if (!entry) return;
    entry.animation.cancel();
    entry.cleanup();
  }, []);

  const measure = useCallback(() => {
    previousCards.current = snapshots(readCards(root.current));
  }, [root]);

  const skipNext = useCallback((ids: Iterable<string>) => {
    const expiresAt = performance.now() + SKIP_WINDOW_MS;
    for (const id of ids) skippedOnce.current.set(id, expiresAt);
  }, []);

  useLayoutEffect(() => {
    const board = root.current;
    if (!board) return;

    const previous = previousCards.current;
    const current = readCards(board);
    const viewport = board.getBoundingClientRect();

    if (!reducedMotion.current && previous.size > 0) {
      const fragment = document.createDocumentFragment();
      const now = performance.now();
      const moves: Array<{
        id: string;
        clone: HTMLElement;
        target: HTMLElement;
        x: number;
        y: number;
        previousVisibility: string;
      }> = [];

      for (const [id, to] of current) {
        if ((skippedOnce.current.get(id) ?? 0) >= now) continue;
        const from = previous.get(id);
        if (!from) continue;
        const x = from.rect.left - to.rect.left;
        const y = from.rect.top - to.rect.top;
        if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) continue;
        if (
          !intersectsViewport(from.rect, viewport) &&
          !intersectsViewport(to.rect, viewport)
        ) {
          continue;
        }

        // An optimistic update is commonly followed by a realtime echo with
        // identical geometry. That echo must not cancel the flight already in
        // progress. Replace an animation only when this card actually moves
        // again.
        cancelCard(id);

        const clone = to.node.cloneNode(true) as HTMLElement;
        removeDuplicateIds(clone);
        clone.removeAttribute("data-issue-id");
        clone.setAttribute("aria-hidden", "true");
        Object.assign(clone.style, {
          position: "fixed",
          left: `${to.rect.left}px`,
          top: `${to.rect.top}px`,
          width: `${to.rect.width}px`,
          height: `${to.rect.height}px`,
          margin: "0",
          opacity: "1",
          pointerEvents: "none",
          transformOrigin: "top left",
          transition: "none",
          visibility: "visible",
          zIndex: "998",
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
          previousVisibility,
        });
      }

      // One insertion avoids a style recalculation for every crossing card.
      if (moves.length > 0) document.body.appendChild(fragment);
      for (const move of moves) {
        const animation = move.clone.animate(
          [
            { transform: `translate3d(${move.x}px, ${move.y}px, 0)` },
            { transform: "translate3d(0, 0, 0)" },
          ],
          {
            duration: MOVE_DURATION_MS,
            easing: "cubic-bezier(0.2, 0, 0, 1)",
            fill: "forwards",
          }
        );
        register(move.id, animation, () => {
          move.target.style.visibility = move.previousVisibility;
          move.clone.remove();
        });
      }
    }

    skippedOnce.current.clear();
    previousCards.current = snapshots(current);
  }, [cancelCard, columns, register, root]);

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
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null;
        measure();
      }, SCROLL_IDLE_MS);
    };
    board.addEventListener("scroll", refreshAfterInteraction, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", refreshAfterInteraction, { passive: true });
    return () => {
      board.removeEventListener("scroll", refreshAfterInteraction, true);
      window.removeEventListener("resize", refreshAfterInteraction);
      motionQuery.removeEventListener("change", updateReducedMotion);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      cancelRunning();
    };
  }, [cancelRunning, measure, root]);

  return { measure, skipNext };
}
