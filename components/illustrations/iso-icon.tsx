"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { ComponentType, CSSProperties, Ref } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { cn } from "@/lib/utils";

/**
 * ANY line icon, turned into an illustration — without drawing anything by
 * hand (MIN-940).
 *
 * The icon sits in the middle of a field of dots. The dots fade out towards the
 * edge, and the ones closest to the icon take the tone's colour, so the drawing
 * glows without being boxed in a shape. The isometric block this replaced read
 * as a technical diagram next to the app's rounded, quiet surfaces.
 *
 * Every dot is WHOLE or absent. A dot that would touch the drawing (or come
 * closer than `CLEARANCE`) is not drawn at all, so the area under the icon is
 * clear without a mask: a mask cuts along the drawing's outline and leaves
 * half-dots along it. The fade is an opacity per dot for the same reason — a
 * gradient mask would shade one dot unevenly. And nothing is painted in the
 * page colour, so the illustration works on every background it sits on (the
 * content pane, a card, a settings section).
 *
 * The name stays `IsoIcon` so the ~90 callers keep working unchanged.
 */

/* ── Geometry, in the 100 × 100 viewBox of the dot field ──────────────────── */

/** The dot field spills past the element by this much on each side, so the
 *  icon can fill most of the width the caller gives (as the old block did)
 *  while the dots still have room to fade. The spill does not take layout
 *  space; the outer dots are nearly transparent. */
const FIELD_SPILL = "-20%";

/** The icon's square, centred: 39 units of a field 1.4× the element, so the
 *  icon spans about 55 % of the element's width. */
const ICON_BOX = 39;
const CENTER = 50;

/** Dot grid: one dot every 8 units, with one exactly on the centre. */
const DOT_STEP = 8;
const DOT_RADIUS = 0.75;

/** Empty space kept between a dot's edge and the drawing. */
const CLEARANCE = 2.5;

/** Grey dots: full strength up to 35 % of the field's radius, gone at its edge. */
const FIELD_RADIUS = 50;
const FIELD_SOLID = 0.35;
/** Coloured dots: full strength up to half this radius, handing over to the grey. */
const CORE_RADIUS = 42;
const CORE_SOLID = 0.5;

/** A Hugeicons drawing is 24 units wide with a 1.5 stroke: until measured,
 *  assume that and place it accordingly. */
const NATIVE = 24;
const STROKE = 1.5;

/** Linear fade from 1 (at `solid` × radius) to 0 (at the radius). */
function fade(distance: number, radius: number, solid: number) {
  const t = (distance / radius - solid) / (1 - solid);
  return Math.min(1, Math.max(0, 1 - t));
}

type Dot = { key: string; x: number; y: number; grey: number; core: number };

/** The grid, computed once: position and the two opacities of each dot. */
const DOTS: Dot[] = (() => {
  const dots: Dot[] = [];
  const reach = Math.floor(FIELD_RADIUS / DOT_STEP);
  for (let i = -reach; i <= reach; i++) {
    for (let j = -reach; j <= reach; j++) {
      const x = CENTER + i * DOT_STEP;
      const y = CENTER + j * DOT_STEP;
      const distance = Math.hypot(x - CENTER, y - CENTER);
      const grey = fade(distance, FIELD_RADIUS, FIELD_SOLID);
      if (grey <= 0.02) continue;
      dots.push({ key: `${i}:${j}`, x, y, grey, core: fade(distance, CORE_RADIUS, CORE_SOLID) });
    }
  }
  return dots;
})();

/** Before the drawing can be measured (server render, hidden element), keep
 *  every dot out of the icon's square plus the clearance. */
const UNMEASURED_HIDDEN = new Set(
  DOTS.filter(
    (dot) =>
      Math.max(Math.abs(dot.x - CENTER), Math.abs(dot.y - CENTER)) <
      ICON_BOX / 2 + DOT_RADIUS + CLEARANCE,
  ).map((dot) => dot.key),
);

/** Points sampled across a dot's disc grown by the clearance: the centre and
 *  three rings. Their spacing stays under the drawn stroke's width, so a
 *  stroke cannot pass between them. */
const SAMPLES: [number, number][] = (() => {
  const points: [number, number][] = [[0, 0]];
  const outer = DOT_RADIUS + CLEARANCE;
  for (const radius of [outer / 3, (2 * outer) / 3, outer]) {
    const count = Math.max(6, Math.ceil((2 * Math.PI * radius) / 1.2));
    for (let k = 0; k < count; k++) {
      const angle = (2 * Math.PI * k) / count;
      points.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
    }
  }
  return points;
})();

/**
 * Any SVG icon that can be tinted, transformed and measured: Hugeicons, but
 * also the face of Numo (`components/numo-face.tsx`), which is not one. The
 * contract is these four props — that is all the placement needs.
 */
export type SceneIcon =
  | IconSvgElement
  | ComponentType<{
      className?: string;
      style?: CSSProperties;
      strokeWidth?: number | string;
      ref?: Ref<SVGSVGElement>;
    }>;

/**
 * The colour of the drawing. The ACCENT by default (`primary`, which the
 * account's palette recolours — so the illustrations follow the user's choice
 * rather than staying lavender); red for what DELETES — the trash is
 * recognised by its colour before it is read, and that colour never changes
 * with the palette.
 *
 * Classes are written as LITERALS: the Tailwind scanner does not read a class
 * built by interpolation.
 */
const TONE = {
  brand: { icon: "text-primary", core: "fill-primary/75" },
  destructive: { icon: "text-destructive", core: "fill-destructive/75" },
} as const;

export type SceneTone = keyof typeof TONE;

function Glyph({ icon: Icon, className }: { icon: SceneIcon; className: string }) {
  if (Array.isArray(Icon)) {
    return <HugeiconsIcon icon={Icon} strokeWidth={STROKE} className={className} />;
  }
  const Component = Icon as Exclude<SceneIcon, IconSvgElement>;
  return <Component strokeWidth={STROKE} className={className} />;
}

/**
 * The keys of the dots that touch the drawing, tested against its real
 * geometry (`isPointInFill` covers the inside of each shape, `isPointInStroke`
 * the line itself). Only the dots near the icon are tested.
 */
function dotsTouching(field: SVGSVGElement, group: SVGGElement): Set<string> | null {
  const toScreen = field.getScreenCTM();
  if (!toScreen) return null;
  const shapes = [
    ...group.querySelectorAll<SVGGeometryElement>(
      "path, circle, rect, ellipse, line, polyline, polygon",
    ),
  ].flatMap((shape) => {
    const toShape = shape.getScreenCTM();
    return toShape ? [{ shape, matrix: toShape.inverse().multiply(toScreen) }] : [];
  });
  if (shapes.length === 0) return null;

  const near = ICON_BOX * 0.75 + DOT_RADIUS + CLEARANCE;
  const hidden = new Set<string>();
  for (const dot of DOTS) {
    if (Math.max(Math.abs(dot.x - CENTER), Math.abs(dot.y - CENTER)) > near) continue;
    const touches = SAMPLES.some(([dx, dy]) => {
      const point = new DOMPoint(dot.x + dx, dot.y + dy);
      return shapes.some(({ shape, matrix }) => {
        const local = point.matrixTransform(matrix);
        return shape.isPointInFill(local) || shape.isPointInStroke(local);
      });
    });
    if (touches) hidden.add(dot.key);
  }
  return hidden;
}

/**
 * An icon in its field of dots. Square: the container takes a WIDTH and the
 * height follows.
 */
export function IsoIcon({
  icon,
  tone = "brand",
  className,
  style,
}: {
  icon: SceneIcon;
  /** Drawing colour — `destructive` for what removes. */
  tone?: SceneTone;
  className?: string;
  style?: CSSProperties;
}) {
  const fieldRef = useRef<SVGSVGElement>(null);
  const ref = useRef<SVGGElement>(null);
  /**
   * The icon renders as its own nested `<svg>` at its native size, at the
   * origin: CSS sizing (`size-full`) does not apply to an `<svg>` nested in
   * another one, so it cannot be stretched into place that way. And a
   * drawing does not fill its viewBox the same way from one icon to the next:
   * `Filter` reaches the edges, `Target` leaves a margin.
   *
   * So we MEASURE the drawing in the field's own units (`getBBox` on the group
   * that holds it covers the nested viewport) and move its centre onto the
   * field's centre, scaled to fill the icon square — never beyond.
   */
  const [fit, setFit] = useState(() => {
    const scale = ICON_BOX / NATIVE;
    return { scale, x: CENTER - scale * (NATIVE / 2), y: CENTER - scale * (NATIVE / 2) };
  });
  const [hidden, setHidden] = useState<Set<string>>(UNMEASURED_HIDDEN);

  useLayoutEffect(() => {
    const group = ref.current;
    if (!group) return;
    try {
      const box = group.getBBox();
      if (!(box.width > 0 || box.height > 0)) return;
      // `getBBox` measures geometry WITHOUT the stroke, which overflows by
      // half a stroke on each side.
      const scale = ICON_BOX / (Math.max(box.width, box.height) + STROKE);
      setFit({
        scale,
        x: CENTER - scale * (box.x + box.width / 2),
        y: CENTER - scale * (box.y + box.height / 2),
      });
    } catch {
      // Not rendered yet (display: none) — the default does the job.
    }
  }, [icon]);

  // Once the drawing is in place (both effects run before the first paint).
  useLayoutEffect(() => {
    const field = fieldRef.current;
    const group = ref.current;
    if (!field || !group) return;
    try {
      const touching = dotsTouching(field, group);
      if (touching) setHidden(touching);
    } catch {
      // A browser without the geometry API keeps the square cleared.
    }
  }, [icon, fit]);

  const paint = TONE[tone];

  return (
    <span
      className={cn("relative block aspect-square", className)}
      style={style}
      aria-hidden
    >
      <svg
        ref={fieldRef}
        viewBox="0 0 100 100"
        className="pointer-events-none absolute overflow-visible"
        style={{ inset: FIELD_SPILL }}
      >
        {DOTS.filter((dot) => !hidden.has(dot.key)).map((dot) => (
          <g key={dot.key}>
            <circle cx={dot.x} cy={dot.y} r={DOT_RADIUS} opacity={dot.grey} className="fill-foreground/15" />
            {dot.core > 0.01 ? (
              <circle cx={dot.x} cy={dot.y} r={DOT_RADIUS} opacity={dot.core} className={paint.core} />
            ) : null}
          </g>
        ))}
        <g transform={`translate(${fit.x} ${fit.y}) scale(${fit.scale})`}>
          <g ref={ref}>
            <Glyph icon={icon} className={paint.icon} />
          </g>
        </g>
      </svg>
    </span>
  );
}
