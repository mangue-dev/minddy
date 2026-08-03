"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { ComponentType, CSSProperties, Ref } from "react";
import { cn } from "mangue-ui";

/**
 * N'IMPORTE QUELLE icône lucide, rendue en isométrie — sans avoir à la
 * redessiner à la main.
 *
 * Le principe : nos scènes sont en isométrie 2:1 (un pas vers la droite = un
 * demi-pas vers le bas), ce qui donne une transformation CSS exacte.
 *
 *  - `lying` (le défaut) : l'icône est POSÉE À PLAT sur le sol, vraiment
 *    déformée — un carré tourné de 45° puis incliné de 60° autour de X se
 *    projette en losange deux fois plus large que haut, c'est exactement le
 *    terrain dessiné dessous. L'icône prend donc son plan, sa grille et son
 *    angle — c'est la scène entière, sans un trait de SVG à écrire.
 *  - `lying={false}` : l'icône reste DEBOUT, face au lecteur. Plus lisible sur
 *    une icône dessinée de face, mais elle ne se pose sur aucun plan de la
 *    scène — à réserver aux cas où la lecture prime.
 *
 * Rien de tout ça n'est du SVG : ce sont des transformations CSS, donc ça marche
 * avec toute icône lucide, sans toucher au tracé.
 */

/**
 * La scène : un viewBox de 200×78, terrain CENTRÉ, demi-diagonales 70 et 35 —
 * donc un carré de côté 70·√2 ≈ 99 vu en isométrie, et quatre unités de marge
 * au-dessus et au-dessous. La boîte épouse le dessin : la bande vide qu'elle
 * portait autrefois en haut (le terrain y était bas, une carte flottait
 * au-dessus) creusait un écart que l'appelant devait rattraper à la main.
 */
const VIEW_W = 200;
const VIEW_H = 78;
const GROUND_Y = VIEW_H / 2;
const GROUND_A = 70;

/** Le côté de ce carré, en part de la LARGEUR de la scène : l'icône vient s'y
 *  inscrire. Rien à borner en hauteur — le carré non tourné est plus haut que la
 *  boîte, mais une fois couché il tient dans le losange, et c'est le dessin qui
 *  compte, pas la boîte de mise en page. */
const GROUND_SQUARE_W = "49.5%"; // 99 / 200

/**
 * Toute icône SVG qui se laisse teinter, transformer et mesurer : les icônes
 * lucide, mais aussi le visage de Numo (`components/numo-face.tsx`), qui n'en
 * est pas une. Le contrat tient en quatre props — c'est tout ce dont la mise en
 * isométrie a besoin.
 */
export type SceneIcon = ComponentType<{
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number | string;
  ref?: Ref<SVGSVGElement>;
}>;

/** Le jeu entre le tracé et le bord du carré : sans lui, l'icône remplie au
 *  maximum vient coller aux arêtes du losange et la scène étouffe. */
const ICON_INSET = 15;

export function IsoIcon({
  icon: Icon,
  size,
  depth = 1,
  lying = true,
  spin = -45,
  className,
  style,
}: {
  icon: SceneIcon;
  /** Côté de l'icône. Absent = celui que l'appelant impose par `style`. */
  size?: number;
  /** Copies d'épaisseur (1 = une icône plate, sans relief). */
  depth?: number;
  /** Poser l'icône à plat sur le sol plutôt que la garder debout. */
  lying?: boolean;
  /** Orientation au sol, en degrés (`lying` uniquement). */
  spin?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<SVGSVGElement>(null);
  /**
   * Le tracé d'une icône n'occupe pas tout son viewBox, et pas de la même façon
   * d'une icône à l'autre : `Filter` descend jusqu'aux bords, `Target` laisse
   * une marge. On MESURE donc le dessin une fois rendu, et on le recentre et
   * l'agrandit pour qu'il remplisse le carré du terrain — au maximum, jamais
   * au-delà.
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

  const layers = Math.max(depth, 1);
  // Ordre des transformées : la plus à DROITE s'applique d'abord. On recentre
  // le tracé, on l'agrandit, on le couche dans le plan du sol, et l'épaisseur
  // éventuelle décale le tout à la verticale, dans le plan de l'écran.
  const flatten = lying ? `rotateX(60deg) rotateZ(${spin}deg) ` : "";
  const fitted = `scale(${fit.scale}) translate(${fit.dx}%, ${fit.dy}%)`;

  return (
    <span
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: size, height: size, ...style }}
      aria-hidden
    >
      {Array.from({ length: layers }).map((_, i) => {
        const top = i === layers - 1;
        const back = layers - 1 - i;
        return (
          <Icon
            key={i}
            ref={i === 0 ? ref : undefined}
            strokeWidth={1.5}
            className={cn(
              "absolute inset-0 size-full",
              top ? "text-brand" : "text-brand/25"
            )}
            style={{
              transform: `translateY(${-back * 1.6}px) ${flatten}${fitted}`,
            }}
          />
        );
      })}
    </span>
  );
}

/**
 * Le terrain : un losange en pointillés et sa grille, le sol commun de toutes
 * les scènes. Un carré de côté 99 vu en isométrie 2:1 — d'où les demi-
 * diagonales 70 et 35, et le carré où l'icône vient s'inscrire.
 */
function Ground() {
  const cx = VIEW_W / 2;
  const cy = GROUND_Y;
  const a = GROUND_A;
  const b = a / 2;
  const half = a / 2;
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="absolute inset-0 size-full"
      role="presentation"
      aria-hidden
    >
      <g className="stroke-border" strokeWidth={1.25} fill="none">
        <path
          d={`M${cx} ${cy - b} L${cx + a} ${cy} L${cx} ${cy + b} L${cx - a} ${cy} Z`}
          strokeDasharray="4 4"
          strokeLinejoin="round"
        />
        {/* Les deux médianes, parallèles aux bords : de quoi lire le plan sans
            charger la scène. */}
        <path
          d={`M${cx - half} ${cy - b / 2} L${cx + half} ${cy + b / 2}`}
          className="stroke-border/70"
        />
        <path
          d={`M${cx + half} ${cy - b / 2} L${cx - half} ${cy + b / 2}`}
          className="stroke-border/70"
        />
      </g>
    </svg>
  );
}

/**
 * Une icône isométrique posée sur le terrain : l'illustration d'un état vide,
 * sans rien dessiner à la main. L'icône s'inscrit dans le carré du sol, au plus
 * grand.
 *
 * Le rapport du conteneur est celui de la scène — donner une LARGEUR suffit, la
 * hauteur suit. Le forcer autrement décalerait l'icône du terrain : le SVG se
 * centrerait dans une boîte plus large que lui, l'icône non.
 */
export function IsoIconScene({
  icon,
  className,
  lying = true,
  ...iconProps
}: {
  icon: SceneIcon;
  depth?: number;
  lying?: boolean;
  spin?: number;
  className?: string;
}) {
  return (
    /* Le rapport en STYLE, pas en classe : une classe Tailwind construite par
       interpolation n'est jamais générée (le scanner ne lit que des littéraux),
       et il vaut mieux qu'il suive les constantes ci-dessus. */
    <div
      className={cn("relative", className)}
      style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
    >
      <Ground />
      {/* La taille vit sur CE span : positionné en absolu, ses pourcentages se
          rapportent à la scène — un enfant en `%` d'un parent qui s'ajuste à
          son contenu ne mesurerait rien. */}
      <span
        className="absolute top-1/2 left-1/2"
        style={{
          width: GROUND_SQUARE_W,
          aspectRatio: "1",
          // Le jeu se prend AVANT la déformation, donc dans le plan du sol : il
          // reste régulier le long des quatre arêtes du losange.
          padding: ICON_INSET,
          transform: lying ? "translate(-50%, -50%)" : "translate(-50%, -100%)",
        }}
      >
        <IsoIcon icon={icon} lying={lying} {...iconProps} className="size-full" />
      </span>
    </div>
  );
}
