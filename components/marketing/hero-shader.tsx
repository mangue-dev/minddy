"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "mangue-ui/components/theme-provider";
import { cn } from "mangue-ui/lib/utils";

/**
 * The animated background of the landing (MIN-73), mounted twice: under the hero and under
 * the last restart, so that the page closes as it opens. Everything that follows applies to both; only the geometry and the mask change.
 *
 * It is the same “grain gradient” shader as the
 * connection panel — same colors, derived from the `--primary` token (cf.
 * useShaderPalette) — but much more discreet: it is a background, not a subject.
 *
 * Deliberately calm settings (low intensity and opacity, large scale):
 * the hero's text passes over it and must remain the strongest point of contrast on the page. The WebGL is only mounted from `sm` (on mobile it costs
 * a battery for a strip of 200 px) and the animation freezes if the user
 * requests less movement. A masking gradient blends the shader into the
 * page down, so there is no seam with the next section.
 *
 * Goes to the PAGE level, not the hero: anchored to the `relative isolate`
 * of the marketing layout, it leaves from the top of the document and goes behind the navbar
 * (transparent outside its pastille) thanks to `-z-10`. Mounting it in the hero
 * would make it start below the 80 px reserved for the bar, with a horizontal seam
 * visible just below.
 *
 * IT STOPS WHEN YOU PASS IT. The library only pauses the loop
 * if the TAB is hidden (`document.hidden`): it has no IntersectionObserver.
 * Measured on the landing, the shader therefore still required 120 frames per second
 * while it was 10,700 px above the viewport — for a background that
 * no one is looking at, over the entire length of the page. Observe it below
 * changes `speed` to 0 as soon as it leaves the field, which `setCurrentSpeed` translates
 * by a `cancelAnimationFrame` (shader-mount.js): the loop stops dead.
 *
 * We don't DISASSEMBLE the shader though — that would destroy the WebGL context and
 * it would have to be recreated each time we return to the top of the page, which costs more
 * than leaving a canvas frozen on its last image.
 */
/**
 * `@paper-design/shaders-react` is a WebGL library: statically loaded,
 * it entered the INITIAL bundle of the landing — the one which must arrive
 * before the page is interactive — for a decorative background which is not even
 * mounted under 640 px. `ssr: false` because the shader doesn't render anything
 * useful on the server side: it's a canvas (MIN-88).
 *
 * The target of `dynamic()` is `grain-canvas.tsx`, NOT the library (MIN-100).
 * Next preloads the chunk of a `dynamic()` into the document as soon as the component
 * which renders it passes through server rendering: `GrainBackdrop` always rendering its
 * container, WebGL was downloaded even on mobile, where `enabled` remains false
 * and where nothing ever displays. By mounting it under a state condition — therefore
 * never on the server side — the chunk is only requested where it is used.
 */
const GrainCanvas = dynamic(() => import("./grain-canvas"), { ssr: false });

/** Masking Gradient: The shader never stops abruptly, it blends into the
 page. The hero dissolves downwards; the CTA, caught between two sections, dissolves on both sides. */
const MASKS = {
  hero: "linear-gradient(to bottom, black 0%, black 35%, transparent 100%)",
  cta: "linear-gradient(to bottom, transparent 0%, black 35%, black 68%, transparent 100%)",
} as const;

function GrainBackdrop({
  className,
  mask,
}: {
  /** Bottom geometry: it is the caller who decides where it lands. */
  className: string;
  mask: string;
}) {
  const { resolvedTheme } = useTheme();
  const [enabled, setEnabled] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const holder = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mqWide = window.matchMedia("(min-width: 640px)");
    const mqMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setEnabled(mqWide.matches);
      setReduced(mqMotion.matches);
    };
    sync();
    mqWide.addEventListener("change", sync);
    mqMotion.addEventListener("change", sync);
    return () => {
      mqWide.removeEventListener("change", sync);
      mqMotion.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    const el = holder.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // A margin of 200 px restarts the animation just before it becomes
    // visible: no one should see the bottom disappear before their eyes.
    const io = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      { rootMargin: "200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);

  const isDark = resolvedTheme === "dark";

  return (
    <div
      ref={holder}
      aria-hidden="true"
      className={cn(
        "pointer-events-none transition-opacity duration-700 ease-out",
        className,
      )}
      style={{
        opacity: enabled ? (isDark ? 0.5 : 0.35) : 0,
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    >
      {enabled && <GrainCanvas isDark={isDark} speed={reduced || !onScreen ? 0 : 0.7} />}
    </div>
  );
}

/** The background of the top of the page, placed at the level of the PAGE (see above). */
export function HeroShader() {
  return (
    <GrainBackdrop
      className="absolute inset-x-0 top-0 -z-10 h-[520px] sm:h-[640px]"
      mask={MASKS.hero}
    />
  );
}

/**
 * The same background under the last restart: the page closes on the image which
 * opened it. It fills the section (which has `relative isolate`) instead of
 * from the top of the document, and blends at the top as well as the bottom so as not to seam with either the FAQ or the footer.
 */
export function CtaShader() {
  return <GrainBackdrop className="absolute inset-0 -z-10" mask={MASKS.cta} />;
}
