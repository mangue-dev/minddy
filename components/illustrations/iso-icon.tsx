"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { ComponentType, CSSProperties, Ref } from "react";
import { cn } from "mangue-ui";

/**
 * N'IMPORTE QUELLE icône lucide, posée sur un BLOC isométrique — sans avoir à la
 * redessiner à la main.
 *
 * CE QUI A CHANGÉ, ET POURQUOI. Jusqu'ici l'icône était COUCHÉE dans le plan du
 * sol : `rotateX(60deg) rotateZ(-45deg)`, la projection exacte du terrain
 * isométrique, donc géométriquement juste. C'est là qu'était le problème — cette
 * projection écrase le dessin de moitié ET le tourne de 45°. Les seules icônes
 * qui y survivaient sont celles faites de bandes horizontales ou de carrés
 * concentriques (`Layers`, `LayoutList`, `Command`) ; tout ce dont le sens tient
 * à la silhouette ou à l'orientation devenait méconnaissable — `Mic`, `BellRing`,
 * `Search`, `Upload`, et pire que tout les CHIFFRES des cartes numérotées. Une
 * illustration qui demande un effort de lecture ne sert plus d'ancrage visuel :
 * elle en coûte un.
 *
 * L'isométrie a donc quitté l'icône pour le SOLIDE qui la porte. Le tracé est
 * rendu de face, intact, sur la face avant d'un bloc extrudé vers l'arrière-
 * gauche. On garde l'ancrage — un objet, dans le plan de l'app — et on récupère
 * la lisibilité entière, chiffres compris.
 *
 * CE QUI FAIT UN BLOC ET PAS UN RECTANGLE, deux choses, et elles ne sont pas
 * décoratives :
 *
 *  - UNE SEULE MATIÈRE. Peindre la face en `--card` et l'extrusion en teinte de
 *    marque donne deux matériaux, donc un rectangle blanc avec une ombre bleue
 *    derrière. Les trois faces sont de la MÊME teinte à trois valeurs : c'est
 *    l'écart de valeur, pas le contour, qui fait lire un volume. La face avant
 *    est la plus claire, pour que le tracé y ressorte ; les faces qui s'éloignent
 *    montent en densité.
 *  - DES ARÊTES VIVES. Aucun arrondi — un `rx` de quelques unités suffit à faire
 *    une pastille de ce qui doit être une pierre. Jonctions en `miter`, et les
 *    arêtes tracées en filet non mis à l'échelle (`non-scaling-stroke`) : un
 *    pixel à toutes les tailles, net sur une tuile de 44 px comme sur une
 *    illustration de 144.
 *
 * Le TERRAIN en pointillés qui portait les états vides a disparu avec la mise à
 * plat : il servait à donner un plan à une icône couchée. Le bloc porte son
 * propre volume, un quadrillage sous lui ne dirait plus rien.
 */

/* ── Géométrie du bloc ────────────────────────────────────────────────────────
   Un cube en isométrie 2:1 : la profondeur file en (−D, −D/2), donc un pas vers
   l'arrière-gauche vaut un demi-pas vers le haut. On voit la face avant, le
   dessus et le côté GAUCHE.

   La face est un VRAI carré de côté F. Largeur occupée F + D = 100 ; hauteur
   F + D/2 = 91 — la silhouette d'un cube vu en 2:1 est toujours plus large que
   haute, et c'est correct. La boîte épouse le dessin, d'où le viewBox 100×91 :
   une bande vide ferait flotter le bloc dans sa case et chaque appelant la
   rattraperait à sa façon.

   D à 18 pour un côté de 82 : au-delà le volume mange l'icône et on ne lit plus
   qu'un bloc ; en deçà il redevient une carte plate. */
const DEPTH = 18;
const FACE = 100 - DEPTH;
const VIEW_W = 100;
const VIEW_H = FACE + DEPTH / 2;

/** Les six sommets qui servent, nommés une fois pour que les tracés se lisent. */
const FACE_L = DEPTH;
const FACE_T = DEPTH / 2;
const FACE_B = FACE_T + FACE;
const BACK_R = FACE;
const BACK_B = FACE;

/** Le jeu entre le tracé et le bord de la face. En POURCENTAGE : un padding en
 *  pourcent se rapporte à la LARGEUR du bloc parent sur les quatre côtés, donc
 *  l'inset reste régulier et la boîte du tracé reste carrée. */
const ICON_INSET = "15%";

/**
 * Toute icône SVG qui se laisse teinter, transformer et mesurer : les icônes
 * lucide, mais aussi le visage de Numo (`components/numo-face.tsx`), qui n'en
 * est pas une. Le contrat tient en quatre props — c'est tout ce dont la pose sur
 * le bloc a besoin.
 */
export type SceneIcon = ComponentType<{
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number | string;
  ref?: Ref<SVGSVGElement>;
}>;

/**
 * La teinte du solide. La marque par défaut ; le rouge pour ce qui SUPPRIME —
 * la corbeille se reconnaît à sa couleur avant de se lire, et la peindre en
 * bleu comme le reste en ferait une section de plus.
 *
 * Les classes sont écrites en LITTÉRAUX : le scanner de Tailwind ne lit pas une
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
 * Une icône posée sur son bloc.
 *
 * Le conteneur ne prend qu'une LARGEUR — la hauteur suit le rapport du solide.
 * La forcer autrement le déformerait ou le décalerait dans sa case.
 */
export function IsoIcon({
  icon: Icon,
  tone = "brand",
  className,
  style,
}: {
  icon: SceneIcon;
  /** Teinte du solide — `destructive` pour ce qui supprime. */
  tone?: SceneTone;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<SVGSVGElement>(null);
  /**
   * Le tracé d'une icône n'occupe pas tout son viewBox, et pas de la même façon
   * d'une icône à l'autre : `Filter` descend jusqu'aux bords, `Target` laisse
   * une marge. On MESURE donc le dessin une fois rendu, et on le recentre et
   * l'agrandit pour qu'il remplisse la face du bloc — au maximum, jamais au-delà.
   */
  const [fit, setFit] = useState({ scale: 1, dx: 0, dy: 0 });

  useLayoutEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    try {
      const box = svg.getBBox();
      // Le viewBox se LIT, il ne se suppose pas : 24 pour une icône lucide, mais
      // 48×39 pour le visage de Numo. Son côté le plus long est ce que
      // `preserveAspectRatio` fait tenir dans le carré, donc l'unité de mesure.
      const vb = svg.viewBox.baseVal;
      const boxW = vb?.width || 24;
      const boxH = vb?.height || 24;
      const frame = Math.max(boxW, boxH);
      // `getBBox` rend la géométrie SANS l'épaisseur du trait : elle déborde
      // d'un demi-trait de chaque côté, sinon le contour toucherait le bord.
      const span = Math.max(box.width, box.height) + 1.5;
      if (!(span > 0)) return;
      setFit({
        scale: frame / span,
        // En pourcentage de l'élément : `translate` s'y rapporte, donc le
        // recentrage tient quelle que soit la taille rendue.
        dx: (((vb?.x ?? 0) + boxW / 2 - (box.x + box.width / 2)) / frame) * 100,
        dy: (((vb?.y ?? 0) + boxH / 2 - (box.y + box.height / 2)) / frame) * 100,
      });
    } catch {
      // Pas encore rendu (display:none) — la valeur par défaut fait l'affaire.
    }
  }, [Icon]);

  const paint = TONE[tone];

  return (
    <span
      className={cn("relative block", className)}
      /* Le rapport en STYLE, pas en classe : une classe Tailwind construite par
         interpolation n'est jamais générée, et il vaut mieux qu'il suive les
         constantes ci-dessus. */
      style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}`, ...style }}
      aria-hidden
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="absolute inset-0 size-full"
        shapeRendering="geometricPrecision"
      >
        {/* Le dessus. */}
        <path
          d={`M${FACE_L} ${FACE_T} L0 0 L${BACK_R} 0 L${VIEW_W} ${FACE_T} Z`}
          className={paint.top}
        />
        {/* Le côté gauche — la face qui s'éloigne le plus, donc la plus dense. */}
        <path
          d={`M${FACE_L} ${FACE_T} L0 0 L0 ${BACK_B} L${FACE_L} ${FACE_B} Z`}
          className={paint.side}
        />
        {/* La face avant : le carré qui porte le tracé, le plus clair des trois. */}
        <path
          d={`M${FACE_L} ${FACE_T} L${VIEW_W} ${FACE_T} L${VIEW_W} ${FACE_B} L${FACE_L} ${FACE_B} Z`}
          className={paint.front}
        />
        {/* Les arêtes : la silhouette, puis les trois qui se voient à l'intérieur
            (haut et gauche de la face, et la jonction dessus/côté). Sans elles le
            solide se dissout dans le fond. */}
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
      {/* Le tracé, de face, inscrit dans la face avant du bloc. */}
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
 * Un TEXTE posé comme une icône — un chiffre, deux lettres.
 *
 * `IsoIcon` ne sait dessiner qu'une chose : un composant SVG qui se laisse
 * teinter, transformer et MESURER. Un glyphe en est un ; il n'y a donc rien à
 * changer à la pose sur le bloc, juste à fabriquer le SVG. Les cartes numérotées
 * de la landing (le trajet d'un retour utilisateur) portent ainsi leur chiffre
 * comme les icônes des sections voisines, au lieu d'une pastille ronde qui les
 * faisait dériver du reste.
 *
 * Le cache tient l'IDENTITÉ du composant stable d'un rendu à l'autre : c'est la
 * dépendance de l'effet de mesure de `IsoIcon`; une fabrique appelée à chaque
 * rendu le relancerait indéfiniment.
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
