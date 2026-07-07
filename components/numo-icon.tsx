"use client";

import { useEffect, useId } from "react";
import { useAnimate, useReducedMotion } from "framer-motion";
import { cn } from "mangue-ui";

export type NumoState = "idle" | "thinking";

type NumoIconProps = Omit<React.SVGProps<SVGSVGElement>, "ref"> & {
  /** Drives the facial reaction. Defaults to a calm blink/glance loop. */
  state?: NumoState;
  /**
   * Set to `false` for a still face — appropriate for tiny list icons (e.g. a
   * command-palette row rendered once per project) where perpetual blink/glance
   * loops would be noisy and wasteful. Defaults to `true`.
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

// SVG transforms default to the (0,0) origin; `fill-box` + `center` pins the
// blink scale to the eyes' own bounding-box centre instead.
const centerOrigin: React.CSSProperties = {
  transformBox: "fill-box",
  transformOrigin: "center",
};

// The blob outline — Numo's head. Static: only the face moves. Copied verbatim
// from assets/icons/numo.
const HEAD_PATH =
  "M23.8996 3.21557C25.4759 2.44665 29.3385 1.05454 33.2319 3.27615C35.0641 4.33347 36.6562 6.00186 37.7947 8.13354C38.145 8.78951 38.7431 9.33539 39.52 9.5761C40.6291 9.9197 41.6323 10.6383 42.3712 11.736L42.5156 11.961C43.4434 13.4863 43.584 15.2825 43.4928 16.6594L43.4412 17.2221C43.3542 17.9629 43.5188 18.7418 43.9467 19.393C44.3102 19.9464 44.6176 20.5596 44.859 21.2186L44.863 21.2274C44.8949 21.3133 44.9204 21.3924 44.9617 21.5131L44.9627 21.5131C46.0659 24.8969 45.0541 28.8267 42.6654 31.0035L42.6557 31.0124C41.4435 32.1318 40.0583 32.8799 38.6154 33.2331L38.3266 33.2987C37.7481 33.4176 37.163 33.4712 36.5782 33.4617C35.5552 33.4384 34.5359 33.2231 33.5562 32.8171C32.5162 32.3862 31.3991 32.6321 30.6206 33.3148L30.4697 33.457C28.6657 35.2811 26.7176 36.0813 24.6799 36.0458C23.827 36.0229 22.9763 35.8766 22.146 35.6054L21.792 35.4818C20.5759 35.0276 19.4043 34.3936 18.3051 33.59L17.8379 33.2344L17.6763 33.1158C16.9064 32.5899 15.9319 32.4753 15.058 32.8262L14.8728 32.9089C13.6741 33.4923 12.401 33.7704 11.1289 33.7388L11.1211 33.7389C10.7578 33.7313 10.3942 33.7009 10.0328 33.6483L10.0319 33.6483C7.90779 33.3326 5.97346 32.1957 4.5896 30.4096C4.43645 30.2113 3.50228 28.9604 2.81913 27.1401C2.13631 25.3204 1.75602 23.0761 2.48491 20.7673L2.48393 20.7663C2.96063 19.2693 3.80805 18.019 4.87988 17.0881C5.64744 16.4214 5.98314 15.4525 5.95213 14.5575C5.90789 13.2808 6.08932 11.4891 7.08327 9.83242L7.08425 9.83144C8.34469 7.72609 10.1388 7.13277 11.0575 6.95863C11.8334 6.81157 12.3558 6.31912 12.6431 5.85971L12.648 5.85286C13.5742 4.35935 14.8686 3.39572 16.2357 3.02841C16.359 2.99627 16.4863 2.96573 16.6133 2.93808L16.6621 2.92715C18.3402 2.57703 20.0655 2.71004 21.7027 3.32172C22.4249 3.59157 23.2144 3.5497 23.8996 3.21557Z";

const MOUTH_PATH =
  "M20.5 21L20.7519 21.1679C21.5657 21.7105 22.5219 22 23.5 22C24.4946 22 25.4663 21.7014 26.2893 21.143L26.5 21";

/**
 * Numo — the minddy assistant's animated face. A minimalist mascot (blob
 * outline + two eyes + smile). The head outline stays still; the eyes and mouth
 * move together as one face (`data-numo-face`). Base colour is inherited via
 * `currentColor` (tint with a `text-*` class). While thinking, the face glances
 * to the top-right and a soft bluish gradient flows across it. Honours
 * `prefers-reduced-motion` by rendering a still face.
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
    <svg
      ref={scope}
      viewBox="0 0 48 39"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn(className)}
      {...props}
    >
      {thinking && (
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
      )}

      {/* Head outline — static. */}
      <path d={HEAD_PATH} stroke={paint} strokeWidth={4} />
      {/* Face = eyes + mouth, translated together so a glance reads as the
          whole face turning. */}
      <g data-numo-face>
        <g data-numo-blink style={centerOrigin}>
          <rect x="16" y="12" width="4" height="6" rx="2" fill={paint} />
          <rect x="27" y="12" width="4" height="6" rx="2" fill={paint} />
        </g>
        <path
          d={MOUTH_PATH}
          stroke={paint}
          strokeWidth={3}
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
