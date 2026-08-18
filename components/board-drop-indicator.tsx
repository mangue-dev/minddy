"use client";

/**
 * The line that says where the card will land.
 *
 * It replaces the offset of dnd-kit cards, and it replaces it for two
 * reasons: the shift was replayed at the depot (two animations, therefore the
 * startles), and it opened a hole UNDER THE CURSOR even when the column was
 * sorted by priority or by date — that is, where the card did not go
 * not to fall. Here the place comes from `previewBoardMove`, which replays the
 * sorting of the target column: the line is at the actual arrival, cursor or not.
 *
 * **It doesn't push anything, and it's calculated.** Insert into a stack by `gap-2`
 * adds a gutter (8 px) plus its own height (2 px); `-my-[5px]` resumes
 * the ten. Total: zero. Without that, each change of place would shift the
 * maps below — therefore the rectangles that dnd-kit measures — and the marker
 * could oscillate between two positions at the edge of a map.
 *
 * In return, he lives in the gutter: in the first place of a column,
 * he touches the top edge of the scroller, and **everything he places around his line
 * y is within cutting range**. This is what ate its round point in preview
 * (PR 66): the `rounded-xl` of the column was placed on the container WHO
 * SCROLL, and a rounding crops the content into its four corner arcs. Rounding
 * is passed to the parent — same box on the screen, square cut — and the pastille
 * of account goes below the line instead of going above it.
 */

import { useEffect, useRef, type RefObject } from "react";
import { cn } from "mangue-ui";
import type { DropPreview } from "@/lib/board-drag";

/** What the column looks for in the DOM to bring the mark to the screen. */
const MARKER_PROPS = { "data-board-drop-indicator": "" } as const;
const MARKER_SELECTOR = "[data-board-drop-indicator]";

/**
 * Bring the marker into the field of vision of its column, ONE time per entry.
 *
 * It doesn't seem like much and that's what makes sorted columns usable:
 * under sorting by priority or by deadline, the drop point owes nothing to the
 * cursor - let go at the bottom of a column and the card is stored ten more places
 * high, often out of the visible part. The benchmark would then be correct and
 * invisible, that is to say useless.
 *
 * Once per entry in the column, and not with each movement: scrolling
 * changes the closest map, therefore the marker, therefore the scrolling — we
 * don't open that loop. That's enough, because under sorting by field instead
 * no longer moves once the column is chosen, and under manual sorting it is there
 * where we point, therefore already visible.
 */
export function useRevealDropIndicator(
  scroller: RefObject<HTMLElement | null>,
  preview: DropPreview | undefined
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
        box.scrollTop + (target.top - view.top) - view.height / 2 + target.height / 2,
      behavior: "smooth",
    });
  }, [preview, scroller]);
}

export function BoardDropIndicator({
  count = 1,
  className,
}: {
  /** Package size — beyond a ticket, the line carries it in a pellet. */
  count?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      {...MARKER_PROPS}
      className={cn(
        "relative -my-[5px] h-0.5 shrink-0 rounded-full bg-primary",
        className
      )}
    >
      <span className="absolute -left-1 top-1/2 size-2 -translate-y-1/2 rounded-full bg-primary" />
      {/* The pellet goes down below the line rather than above: placed in
 `-top-2`, it passed above the top edge of the column — therefore
 outside the cut-out field — when the packet landed in first place. */}
      {count > 1 && (
        <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
          {count}
        </span>
      )}
    </div>
  );
}
