"use client";

import { useEffect, useLayoutEffect, useRef, type AnimationEvent, type ReactNode } from "react";

/**
 * The Smart Fill sweep (MIN-1032): an empty card becomes the filled one under
 * a colored band that falls through it, with a blur traveling along. Shared
 * by the board (components/smart-fill-reveal-frame.tsx) and the landing's
 * figures, and kept as light as a card can be:
 *
 * - The animation is CSS (`.smart-fill-sweep*` in app/globals.css):
 *   transforms, mask positions and opacities, no script per frame.
 * - The script measures the two faces once, when the reveal starts, so the
 *   box can ease from one height to the other with a CSS transition. Both
 *   faces stretch to that height, so the card's border and rounded corners
 *   are always the edges of the box that clips the band.
 * - Nothing of it exists before a reveal: an idle card renders its face
 *   alone, and this frame only while Smart Fill fills it.
 *
 * Under reduced motion the filled face replaces the empty one at once.
 */

/** How long the reveal lasts; `onDone` fires then. Matches `smart-fill-glow`. */
export const SMART_FILL_SWEEP_MS = 1_500;

/** Both faces share one grid cell and fill it. */
const LAYER = "col-start-1 row-start-1 min-h-0 *:h-full";

export function SmartFillSweep({
  revealing,
  placeholder,
  children,
  onDone,
  overlay,
}: {
  /** False: the empty face alone. True: the sweep to `children`. */
  revealing: boolean;
  /** The face before Smart Fill. */
  placeholder: ReactNode;
  /** The filled face, live. */
  children: ReactNode;
  /** The reveal is over: render the filled face without this frame. */
  onDone: () => void;
  /** Painted above both faces, such as the agent beam while Smart Fill works. */
  overlay?: ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const filledRef = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useLayoutEffect(() => {
    if (!revealing) return;
    const frame = frameRef.current;
    const placeholderLayer = placeholderRef.current;
    const filledLayer = filledRef.current;
    if (
      !frame ||
      !placeholderLayer ||
      !filledLayer ||
      typeof window.matchMedia !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      onDoneRef.current();
      return;
    }
    // Each face's own height, read before the first paint with the cell not
    // stretching them. Fractional on purpose: ending on a rounded height made
    // the card jump half a pixel when the frame was removed.
    frame.style.alignItems = "start";
    const from = placeholderLayer.getBoundingClientRect().height;
    const to = filledLayer.getBoundingClientRect().height;
    frame.style.removeProperty("align-items");
    frame.style.height = `${from}px`;
    // Commit the start height, so the CSS transition runs to the end one.
    void frame.offsetHeight;
    frame.style.height = `${to}px`;
    // Animation events can be skipped (a hidden tab): the timer ends it anyway.
    const timer = window.setTimeout(() => onDoneRef.current(), SMART_FILL_SWEEP_MS + 200);
    return () => {
      window.clearTimeout(timer);
      frame.style.removeProperty("height");
    };
  }, [revealing]);

  const onAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.animationName === "smart-fill-glow-band") onDoneRef.current();
  };

  return (
    <div
      ref={frameRef}
      data-smart-fill={revealing ? "revealing" : "filling"}
      aria-busy={revealing ? undefined : true}
      onAnimationEnd={revealing ? onAnimationEnd : undefined}
      // One row as tall as the box: an `auto` row would keep the taller face's
      // height and clip the shrinking card's bottom border. The rounded
      // overflow clips the band and the blur to the card's own shape.
      className="smart-fill-sweep relative isolate grid grid-rows-[minmax(0,1fr)] overflow-hidden rounded-2xl"
    >
      {revealing ? (
        <>
          <div
            ref={placeholderRef}
            aria-hidden
            inert
            className={`${LAYER} smart-fill-sweep-placeholder pointer-events-none`}
          >
            {placeholder}
          </div>
          <div ref={filledRef} className={`${LAYER} smart-fill-sweep-filled`}>
            {children}
          </div>
          <div aria-hidden className="smart-fill-sweep-track">
            <div className="smart-fill-sweep-blur" />
            <div className="smart-fill-sweep-band" />
          </div>
        </>
      ) : (
        <div ref={placeholderRef} className={LAYER}>
          {placeholder}
        </div>
      )}
      {overlay}
    </div>
  );
}
