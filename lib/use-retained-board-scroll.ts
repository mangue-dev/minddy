"use client";

import { useCallback, useLayoutEffect, useRef, type UIEvent } from "react";

const COLUMN_SELECTOR = "[data-board-column-scroller]";

/** Restore native column offsets lost while Activity hides a retained board. */
export function useRetainedBoardScroll(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const positions = useRef(new WeakMap<HTMLElement, { top: number; left: number }>());
  const onScrollCapture = useCallback((event: UIEvent<HTMLDivElement>) => {
    const node = event.target;
    if (event.currentTarget.dataset.appViewActive !== "true" ||
      !(node instanceof HTMLElement) || !node.matches(COLUMN_SELECTOR)) return;
    positions.current.set(node, { top: node.scrollTop, left: node.scrollLeft });
  }, []);

  // This hook lives outside Activity: its parent layout effect runs after the
  // children's reconnect effects, once their visible scroll ranges exist.
  // Repeated active renders and ordinary focus changes never restore an offset.
  useLayoutEffect(() => {
    if (!active) return;
    for (const node of ref.current?.querySelectorAll<HTMLElement>(COLUMN_SELECTOR) ?? []) {
      const saved = positions.current.get(node);
      if (saved) {
        node.scrollTop = saved.top;
        node.scrollLeft = saved.left;
      }
    }
  }, [active]);

  return { ref, onScrollCapture };
}
