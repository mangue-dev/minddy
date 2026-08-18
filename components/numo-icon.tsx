"use client";

import { useEffect, useId } from "react";
import { useAnimate, useReducedMotion } from "framer-motion";
import { cn } from "mangue-ui";
import { NumoFace, type NumoFaceProps } from "./numo-face";

export type NumoState = "idle" | "thinking";

type NumoIconProps = Omit<NumoFaceProps, "ref" | "paint" | "defs"> & {
  /** Drives the facial reaction. Defaults to a calm blink/glance loop. */
  state?: NumoState;
  /**
 * Set to `false` for a still face — appropriate for tiny list icons (e.g. a
 * command-palette row rendered once per project) where perpetual blink/glance
 * loops would be noisy and wasteful. Defaults to `true`.
 *
 * ⚠ This flag does not prevent framer-motion from entering the bundle: the hook
 * is called at the first level, so the import exists anyway. A
 * caller who ONLY wants the face still — and who doesn't already ship
 * framer-motion — renders `NumoFace` directly (MIN-100).
 */
  animated?: boolean;
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// A gentle in-out curve (≈ easeInOutSine) for the face glances so movement
// eases in and out instead of snapping.
const EASE_SMOOTH: [number, number, number, number] = [0.37, 0, 0.63, 1];

// Where the face locks while thinking (top-right glance, in viewBox units).
const THINK_LOOK = { x: 3.5, y: -3 };

// Flowing "thinking" gradient — a soft bluish sheen over the primary tint.
// First and last stops match so the
// repeated tile translates seamlessly. Set via CSS so `var(--primary)` resolves
// and follows the theme.
const GRADIENT_STOPS = [
  { offset: "0", color: "var(--primary)" },
  { offset: "0.5", color: "oklch(0.8 0.1 250)" },
  { offset: "1", color: "var(--primary)" },
];
// Tile width === viewBox width, so a translate of this distance loops exactly.
const GRADIENT_TILE = 48;

/**
 * Numo — the minddy assistant's animated face. A minimalist mascot (blob
 * outline + two eyes + smile). The head outline stays still; the eyes and mouth
 * move together as one face (`data-numo-face`). Base color is inherited via
 * `currentColor` (tint with a `text-*` class). While thinking, the face glances
 * to the top-right and a soft bluish gradient flows across it. Honors
 * `prefers-reduced-motion` by rendering a still face.
 *
 * The drawing itself is in `numo-face.tsx`, which doesn't need any JS: this
 * file only adds the movement.
 */
export function NumoIcon({
  state = "idle",
  animated = true,
  className,
  ...props
}: NumoIconProps) {
  const [scope, animate] = useAnimate();
  const reduced = useReducedMotion();
  // A still face when motion is disabled or the caller opts out.
  const still = reduced || !animated;

  // useId can contain ':', which is invalid inside url(#…) — strip it.
  const gradId = `numo-grad-${useId().replace(/:/g, "")}`;
  const thinking = state === "thinking";
  const paint = thinking ? `url(#${gradId})` : "currentColor";

  // Organic blink — both eyes squash vertically on a randomised interval.
  useEffect(() => {
    if (still) return;
    let cancelled = false;
    void (async () => {
      while (!cancelled) {
        await wait(2000 + Math.random() * 3000);
        if (cancelled) break;
        await animate(
          "[data-numo-blink]",
          { scaleY: [1, 0.1, 1] },
          { duration: 0.18, times: [0, 0.5, 1], ease: "easeInOut" },
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [still, animate]);

  // Idle glances — the whole face flicks toward a point, holds, then recentres.
  useEffect(() => {
    if (still || state !== "idle") return;
    let cancelled = false;
    void (async () => {
      // Recentre on entry — covers returning from the thinking glance without
      // needing a cleanup animate (which would fire after unmount).
      await animate(
        "[data-numo-face]",
        { x: 0, y: 0 },
        { duration: 0.35, ease: EASE_SMOOTH },
      );
      while (!cancelled) {
        await wait(2000 + Math.random() * 2600);
        if (cancelled) break;
        await animate(
          "[data-numo-face]",
          { x: (Math.random() - 0.5) * 7, y: (Math.random() - 0.5) * 4.4 },
          { duration: 0.4, ease: EASE_SMOOTH },
        );
        await wait(1200 + Math.random() * 1600);
        if (cancelled) break;
        await animate(
          "[data-numo-face]",
          { x: 0, y: 0 },
          { duration: 0.5, ease: EASE_SMOOTH },
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [still, state, animate]);

  // Thinking — the face glances up-right and locks there. The looped motion is
  // carried by the flowing gradient (rendered below), not by position. No
  // cleanup animate: returning to centre is handled by the idle effect's entry,
  // so nothing fires after the element unmounts.
  useEffect(() => {
    if (still || state !== "thinking") return;
    void animate("[data-numo-face]", THINK_LOOK, {
      duration: 0.45,
      ease: EASE_SMOOTH,
    });
  }, [still, state, animate]);

  return (
    <NumoFace
      ref={scope}
      className={cn(className)}
      paint={paint}
      defs={
        thinking ? (
          <defs>
            <linearGradient
              id={gradId}
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2={GRADIENT_TILE}
              y2="0"
              spreadMethod="repeat"
            >
              {GRADIENT_STOPS.map((s) => (
                <stop
                  key={s.offset}
                  offset={s.offset}
                  style={{ stopColor: s.color }}
                />
              ))}
              {!still && (
                <animateTransform
                  attributeName="gradientTransform"
                  type="translate"
                  from="0 0"
                  to={`${GRADIENT_TILE} 0`}
                  dur="2s"
                  repeatCount="indefinite"
                />
              )}
            </linearGradient>
          </defs>
        ) : null
      }
      {...props}
    />
  );
}
