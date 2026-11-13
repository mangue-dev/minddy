"use client";

import { useEffect, useState, type ReactNode, type RefCallback } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * Content that unfolds under the row that opens it (an inline submenu, a
 * section of an action sheet): it grows from nothing to its height and fades
 * in, and folds back the same way. The menu or sheet around it is sized by
 * its content, so it resizes with it instead of jumping.
 */
export function Unfold({ open, className, children }: { open: boolean; className?: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="unfold"
          className={cn("overflow-hidden", className)}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          // Folding, it stops asking for its own width at once (a zero width
          // that still fills the menu): a menu sized by its content then
          // narrows while the height folds, not after (useAnimatedWidth).
          exit={{ height: 0, opacity: 0, width: 0, minWidth: "100%" }}
          transition={reduce
            ? { duration: 0 }
            : {
                height: { duration: 0.24, ease: [0.32, 0.72, 0, 1] },
                opacity: { duration: 0.16, ease: "easeOut" },
                width: { duration: 0 },
                minWidth: { duration: 0 },
              }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const WIDTH_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * A menu sized by its content (`w-max`) grows wider when a row unfolds a
 * longer one under it, and jumped to that width while its height unfolded
 * smoothly. This ref follows the menu's width and animates each change over
 * the same time as the unfold, on the screens matching the media query
 * `when`.
 */
export function useAnimatedWidth<T extends HTMLElement>(when: string): RefCallback<T> {
  const [node, setNode] = useState<T | null>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!node || reduce || typeof ResizeObserver === "undefined" || !window.matchMedia?.(when).matches) return;
    let last = node.offsetWidth;
    let running: Animation | null = null;
    const observer = new ResizeObserver(() => {
      // The animation itself resizes the menu: its own frames are not changes.
      if (running) return;
      const next = node.offsetWidth;
      if (next === last || last === 0) {
        last = next;
        return;
      }
      running = node.animate([{ width: `${last}px` }, { width: `${next}px` }], { duration: 240, easing: WIDTH_EASE });
      const settle = () => {
        running = null;
        last = node.offsetWidth;
      };
      running.onfinish = settle;
      running.oncancel = settle;
      last = next;
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      running?.cancel();
    };
  }, [node, when, reduce]);
  return setNode;
}
