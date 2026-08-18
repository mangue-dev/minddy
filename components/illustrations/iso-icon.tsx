"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { ComponentType, CSSProperties, Ref } from "react";
import { cn } from "mangue-ui";

/**
 * ANY lucid icon, placed on an isometric BLOCK — without having to
 * redraw by hand.
 *
 * WHAT HAS CHANGED, AND WHY. Until now the icon was LAYERED in the plane of the
 * ground: `rotateX(60deg) rotateZ(-45deg)`, the exact projection of the ground
 * isometric, therefore geometrically correct. That's where the problem was—this
 * projection crushes the drawing in half AND rotates it 45°. The only icons
 * that survived there are those made of horizontal strips or squares
 * concentric (`Layers`, `LayoutList`, `Command`); everything whose meaning holds
 * the silhouette or orientation became unrecognizable — `Mic`, `BellRing`,
 * `Search`, `Upload`, and worst of all the FIGURES on the numbered cards. A
 * illustration that demands reading effort is no longer a visual anchor:
 * it costs one.
 *
 * Isometry has therefore left the icon for the SOLID which carries it. The route is
 * rendered from the front, intact, on the front face of a block extruded towards the rear-
 * LEFT. We keep the anchor — an object, in the app plan — and we recover
 * full readability, including numbers.
 *
 * WHAT MAKES A BLOCK AND NOT A RECTANGLE, two things, and they are not
 * decorative:
 *
 * - ONE SINGLE MATERIAL. Paint the face in `--card` and the extrusion in shade of
 * mark gives two materials, so a white rectangle with a blue shadow
 * behind. The three faces are of the SAME three-value shade: this is
 * the difference in value, not the contour, which makes a volume read. The front side
 * is the clearest, so that the outline stands out; the faces that move away
 * increase in density.
 * - SHARP EDGES. No rounding — a `rx` of a few units is enough to do
 * a pellet of what must be a stone. Junctions in `miter`, and
 * unscaled meshed edges (`non-scaling-stroke`): a
 * pixel at all sizes, sharp on a 44 px tile as on a
 *    illustration de 144.
 *
 * The dotted TERRAIN which carried the empty states disappeared with the update.
 * flat: it was used to give a plan to a lying icon. The block carries its
 * its own volume; a grid beneath it would say nothing.
 */

/* ── Block geometry ──────────────────────────── ────────────────────────────
   A cube in 2:1 isometry: the depth goes in (−D, −D/2), therefore a step towards
   rear-left is worth a half step up. We see the front side, the
   top and LEFT side.

   The face is a TRUE square with side F. Occupied width F + D = 100; height
   F + D/2 = 91 — the silhouette of a cube seen in 2:1 is always wider than
   high, and that's correct. The box follows the design, hence the viewBox 100×91:
   an empty strip would make the block float in its box and each caller would
   would catch up in his own way.

   D to 18 for a side of 82: beyond that the volume eats the icon and we no longer read
   than a block; below that it becomes a flat card again. */
const DEPTH = 18;
const FACE = 100 - DEPTH;
const VIEW_W = 100;
const VIEW_H = FACE + DEPTH / 2;

/** The six vertices which are used, named once so that the lines can be read. */
const FACE_L = DEPTH;
const FACE_T = DEPTH / 2;
const FACE_B = FACE_T + FACE;
const BACK_R = FACE;
const BACK_B = FACE;

/** The clearance between the line and the edge of the face. In PERCENTAGE: padding in
 * percent refers to the WIDTH of the parent block on all four sides, so
 * the inset remains regular and the plot box remains square. */
const ICON_INSET = "15%";

/**
 * Any SVG icon that can be tinted, transformed and measured: icons
 * lucid, but also the face of Numo (`components/numo-face.tsx`), who does not
 * is not one. The contract is made up of four props — that's all the placement on
 * the block needs.
 */
export type SceneIcon = ComponentType<{
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number | string;
  ref?: Ref<SVGSVGElement>;
}>;

/**
 * The color of solid. The default brand; red for what DELETES —
 * the basket can be recognized by its color before being read, and paint it in
 * blue like the rest would make it one more section.
 *
 * Classes are written in LITERALS: the Tailwind scanner does not read a
 * classe construite par interpolation.
 */
const TONE = {
  brand: {
    icon: "text-brand",
    front: "fill-brand/10",
    top: "fill-brand/20",
    side: "fill-brand/30",
    edge: "stroke-brand/40",
  },
  destructive: {
    icon: "text-destructive",
    front: "fill-destructive/10",
    top: "fill-destructive/20",
    side: "fill-destructive/30",
    edge: "stroke-destructive/40",
  },
} as const;

export type SceneTone = keyof typeof TONE;

/**
 * An icon placed on its block.
 *
 * The container only takes up a WIDTH — the height follows the ratio of the solid.
 * Forcing it otherwise would distort or shift it in its square.
 */
export function IsoIcon({
  icon: Icon,
  tone = "brand",
  className,
  style,
}: {
  icon: SceneIcon;
  /** Solid color — `destructive` for what removes. */
  tone?: SceneTone;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<SVGSVGElement>(null);
  /**
   * The drawing of an icon does not occupy its entire viewBox, and not in the same way
   * from one icon to another: `Filter` goes down to the edges, `Target` leaves
   * a margin. We therefore MEASURE the drawing once rendered, and we refocus it and
   * enlarges it so that it fills the face of the block — to the maximum, never beyond.
   */
  const [fit, setFit] = useState({ scale: 1, dx: 0, dy: 0 });

  useLayoutEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    try {
      const box = svg.getBBox();
      // The viewBox READS, it is not assumed: 24 for a lucid icon, but
      // 48×39 for Numo’s face. Its longest side is what
      // `preserveAspectRatio` fits in the square, therefore the unit of measurement.
      const vb = svg.viewBox.baseVal;
      const boxW = vb?.width || 24;
      const boxH = vb?.height || 24;
      const frame = Math.max(boxW, boxH);
      // `getBBox` renders the geometry WITHOUT the thickness of the line: it overflows
      // half a line on each side, otherwise the outline would touch the edge.
      const span = Math.max(box.width, box.height) + 1.5;
      if (!(span > 0)) return;
      setFit({
        scale: frame / span,
        // As a percentage of the element: `translate` relates to it, so the
        // recentering holds regardless of the rendered size.
        dx: (((vb?.x ?? 0) + boxW / 2 - (box.x + box.width / 2)) / frame) * 100,
        dy: (((vb?.y ?? 0) + boxH / 2 - (box.y + box.height / 2)) / frame) * 100,
      });
    } catch {
      // Not yet rendered (display:none) — the default does the trick.
    }
  }, [Icon]);

  const paint = TONE[tone];

  return (
    <span
      className={cn("relative block", className)}
      /* Report in STYLE, not class: a Tailwind class built by
         interpolation is never generated, and it is better that it follows the
         constantes ci-dessus. */
      style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}`, ...style }}
      aria-hidden
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="absolute inset-0 size-full"
        shapeRendering="geometricPrecision"
      >
        {/* The top. */}
        <path
          d={`M${FACE_L} ${FACE_T} L0 0 L${BACK_R} 0 L${VIEW_W} ${FACE_T} Z`}
          className={paint.top}
        />
        {/* The left side — the side that is furthest away, therefore the densest. */}
        <path
          d={`M${FACE_L} ${FACE_T} L0 0 L0 ${BACK_B} L${FACE_L} ${FACE_B} Z`}
          className={paint.side}
        />
        {/* The front side: the square which carries the outline, the lightest of the three. */}
        <path
          d={`M${FACE_L} ${FACE_T} L${VIEW_W} ${FACE_T} L${VIEW_W} ${FACE_B} L${FACE_L} ${FACE_B} Z`}
          className={paint.front}
        />
        {/* The edges: the silhouette, then the three that can be seen inside
            (top and left of the face, and the top/side junction). Without them
            solid dissolves into the bottom. */}
        <g
          className={paint.edge}
          fill="none"
          strokeWidth={1}
          strokeLinejoin="miter"
          strokeLinecap="square"
        >
          <path
            d={`M${FACE_L} ${FACE_B} L${VIEW_W} ${FACE_B} L${VIEW_W} ${FACE_T} L${BACK_R} 0 L0 0 L0 ${BACK_B} Z`}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={`M${VIEW_W} ${FACE_T} L${FACE_L} ${FACE_T} L${FACE_L} ${FACE_B}`}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={`M${FACE_L} ${FACE_T} L0 0`}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </svg>
      {/* The outline, from the front, inscribed in the front face of the block. */}
      <span
        className="absolute"
        style={{
          left: `${(FACE_L / VIEW_W) * 100}%`,
          top: `${(FACE_T / VIEW_H) * 100}%`,
          width: `${(FACE / VIEW_W) * 100}%`,
          height: `${(FACE / VIEW_H) * 100}%`,
          padding: ICON_INSET,
        }}
      >
        <Icon
          ref={ref}
          strokeWidth={1.5}
          className={cn("size-full", paint.icon)}
          style={{ transform: `scale(${fit.scale}) translate(${fit.dx}%, ${fit.dy}%)` }}
        />
      </span>
    </span>
  );
}

/**
 * A TEXT placed like an icon — one number, two letters.
 *
 * `IsoIcon` only knows how to draw one thing: an SVG component that can be
 * tint, transform and MEASURE. A glyph is one; so there is nothing to
 * change to the pose on the block, just to make the SVG. Numbered cards
 * of the landing (the journey of user feedback) thus carry their figure
 * like the icons of neighboring sections, instead of a round dot which
 * derived from the rest.
 *
 * The cache keeps the IDENTITY of the component stable from one rendering to another: it is the
 * dependence of the measurement effect of `IsoIcon`; a factory called every
 * rendered would restart it indefinitely.
 */
const GLYPHS = new Map<string, SceneIcon>();

export function isoGlyph(text: string): SceneIcon {
  const cached = GLYPHS.get(text);
  if (cached) return cached;
  const Glyph = ({
    className,
    style,
    ref,
  }: {
    className?: string;
    style?: CSSProperties;
    ref?: Ref<SVGSVGElement>;
  }) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      className={className}
      style={style}
      fill="currentColor"
      stroke="none"
      aria-hidden
    >
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="18"
        fontWeight="600"
        letterSpacing="-0.5"
      >
        {text}
      </text>
    </svg>
  );
  Glyph.displayName = `IsoGlyph(${text})`;
  GLYPHS.set(text, Glyph);
  return Glyph;
}
