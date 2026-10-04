"use client";

import { useCallback, useLayoutEffect, useRef, type UIEvent } from "react";



/** Restore only scrollers the user moved; avoid scanning the retained tree. */
export function useRetainedBoardScroll(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<HTMLElement, { top: number; left: number }>());
  const onScrollCapture = useCallback((event: UIEvent<HTMLDivElement>) => {
    const node = event.target;
    if (event.currentTarget.dataset.appViewActive !== "true" ||
      !(node instanceof HTMLElement)) return;
    positions.current.set(node, { top: node.scrollTop, left: node.scrollLeft });
  }, []);

  // This hook lives outside Activity: its parent layout effect runs after the
  // children's reconnect effects, once their visible scroll ranges exist.
  // Repeated active renders and ordinary focus changes never restore an offset.
  useLayoutEffect(() => {
    if (!active) return;
    for (const [node, saved] of positions.current) {
      if (!node.isConnected || !ref.current?.contains(node)) { positions.current.delete(node); continue; }
      if (saved) {
        node.scrollTop = saved.top;
        node.scrollLeft = saved.left;
      }
    }
  }, [active]);

  return { ref, onScrollCapture };
}
