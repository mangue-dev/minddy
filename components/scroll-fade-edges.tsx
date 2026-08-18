"use client";

import { cn } from "mangue-ui";

/**
 * The edge fade of a scroller, drawn NEXT to it rather than PLACED ON it.
 *
 * `useScrollFade` knows how to render a `mask-image` to apply to the scroller itself,
 * and that's what the columns of the scroller did board. The cost is invisible and
 * permanent: **a hidden scroller can no longer be scrolled by simple
 * translation of its layer.** The mask is anchored to the border box, not to the
 * content — it must therefore remain stationary while the content moves, which the
 * composer cannot do alone: it re-composes each time image of
 * scroll. Three instances on the board (one per column, plus the horizontal scroller which contains them - therefore a mask IN a mask) were enough to make it expensive (MIN-319). * only change when an edge crosses its threshold.
 *
 * **To be placed in a parent `relative`, in brother of the scroller** — not inside, otherwise
 * they scroll with the content.
 *
 * ⚠ `from-background` is the REAL background of the board columns (the scroller does not set
 *). On a surface with a different background, pass `from` explicitly:
 * a gradient starting from the wrong color is immediately seen in a dark theme.
 *.
 */
export function ScrollFadeEdges({
  edges,
  axis = "y",
  from = "from-background",
  className,
}: {
  edges: { start: boolean; end: boolean };
  axis?: "x" | "y";
  /** The Tailwind class of the gradient's starting background. */
  from?: string;
  className?: string;
}) {
  const vertical = axis === "y";
  return (
    <>
      {edges.start && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute",
            vertical
              ? "inset-x-0 top-0 h-8 bg-gradient-to-b"
              : "inset-y-0 left-0 w-8 bg-gradient-to-r",
            from,
            "to-transparent",
            className
          )}
        />
      )}
      {edges.end && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute",
            vertical
              ? "inset-x-0 bottom-0 h-8 bg-gradient-to-t"
              : "inset-y-0 right-0 w-8 bg-gradient-to-l",
            from,
            "to-transparent",
            className
          )}
        />
      )}
    </>
  );
}
