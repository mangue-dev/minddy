"use client";

/**
 * Show the exact position where the dragged card will land.
 *
 * This replaces dnd-kit's sortable displacement. That displacement produced a
 * second shift at drop time and opened a gap under the pointer even when a
 * priority or date sort would place the card elsewhere. `previewBoardMove`
 * applies the target column's real ordering, so this marker matches the write.
 *
 * The marker occupies no layout space. In a `gap-2` stack, its 2 px height and
 * the extra 8 px gap are offset by `-my-[5px]`. Otherwise every preview change
 * would move the cards below it, invalidate dnd-kit's rectangles, and make the
 * marker oscillate near card boundaries.
 *
 * The marker therefore sits in the gutter. At the top of a column, its visual
 * details must remain inside the scroller's clip. The count badge is placed
 * below the line for that reason.
 */

import { useEffect, useRef, type RefObject } from "react";
import { cn } from "mangue-ui";
import type { DropPreview } from "@/lib/board-drag";

export type BoardLandingPreview = DropPreview & {
  activeIds: ReadonlySet<string>;
  height: number;
};

/** Selector used by a column to reveal its drop marker. */
const MARKER_PROPS = { "data-board-drop-indicator": "" } as const;
const MARKER_SELECTOR = "[data-board-drop-indicator]";

/**
 * Bring the marker into view once when the pointer enters a column.
 *
 * In columns sorted by priority or deadline, the real destination can be far
 * from the pointer and outside the viewport. The reveal makes that destination
 * useful without starting a feedback loop between scrolling, collision
 * detection, and preview.
 *
 * The reveal is immediate. A smooth scroll could still be running when the
 * card is released, making fixed landing and FLIP layers look stationary while
 * the column moves underneath them.
 */
export function useRevealDropIndicator(
  scroller: RefObject<HTMLElement | null>,
  preview: DropPreview | undefined,
) {
  const revealed = useRef(false);
  useEffect(() => {
    if (!preview) {
      revealed.current = false;
      return;
    }
    if (revealed.current) return;
    revealed.current = true;
    const box = scroller.current;
    const mark = box?.querySelector(MARKER_SELECTOR);
    if (!box || !mark) return;
    const target = mark.getBoundingClientRect();
    const view = box.getBoundingClientRect();
    if (target.top >= view.top && target.bottom <= view.bottom) return;
    box.scrollTo({
      top:
        box.scrollTop +
        (target.top - view.top) -
        view.height / 2 +
        target.height / 2,
      behavior: "auto",
    });
  }, [preview, scroller]);
}

export function BoardDropIndicator({
  count = 1,
  className,
}: {
  /** Bundle size. A badge appears when more than one card is moving. */
  count?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      {...MARKER_PROPS}
      className={cn(
        "relative -my-[5px] h-0.5 shrink-0 rounded-full bg-primary",
        className,
      )}
    >
      <span className="absolute -left-1 top-1/2 size-2 -translate-y-1/2 rounded-full bg-primary" />
      {/* Keep the badge below the line so a first-position marker stays inside
          the column's clipped content area. */}
      {count > 1 && (
        <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
          {count}
        </span>
      )}
    </div>
  );
}

/**
 * Reserve the dragged bundle's final volume while its overlay lands. The
 * optimistic card stays out of the DOM until the landing finishes, so this
 * placeholder is the single owner of the destination slot.
 */
export function BoardDropLandingPlaceholder({ height }: { height: number }) {
  return (
    <div
      aria-hidden
      data-board-drop-placeholder
      className="shrink-0"
      style={{ height }}
    />
  );
}
