"use client";

import { cn } from "mangue-ui";

/**
 * Le fondu de bord d'un scroller, dessiné À CÔTÉ de lui plutôt que POSÉ dessus.
 *
 * `useScrollFade` sait rendre un `mask-image` à appliquer au scroller lui-même,
 * et c'est ce que faisaient les colonnes du board. Le coût est invisible et
 * permanent : **un scroller masqué ne peut plus être fait défiler par simple
 * translation de son calque.** Le masque est ancré à la boîte de bordure, pas au
 * contenu — il doit donc rester immobile pendant que le contenu bouge, ce que le
 * compositeur ne sait pas faire tout seul : il re-composite à chaque image de
 * défilement. Trois instances sur le board (une par colonne, plus le scroller
 * horizontal qui les contient — donc un masque DANS un masque) suffisaient à le
 * rendre coûteux (MIN-319).
 *
 * Deux calques absolus par-dessus coûtent, eux, un dessin unique : ils ne
 * changent que lorsqu'un bord franchit son seuil.
 *
 * **À poser dans un parent `relative`, en frère du scroller** — pas dedans, sinon
 * ils défilent avec le contenu.
 *
 * ⚠ `from-background` est le fond RÉEL des colonnes du board (le scroller n'en
 * pose aucun). Sur une surface au fond différent, passer `from` explicitement :
 * un dégradé qui part de la mauvaise couleur se voit tout de suite en thème
 * sombre.
 */
export function ScrollFadeEdges({
  edges,
  axis = "y",
  from = "from-background",
  className,
}: {
  edges: { start: boolean; end: boolean };
  axis?: "x" | "y";
  /** La classe Tailwind du fond de départ du dégradé. */
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
