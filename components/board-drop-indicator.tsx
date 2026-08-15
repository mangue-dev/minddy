"use client";

/**
 * Le trait qui dit où la carte va se poser.
 *
 * Il remplace le décalage des cartes de dnd-kit, et il le remplace pour deux
 * raisons : le décalage se rejouait au dépôt (deux animations, donc les
 * sursauts), et il ouvrait un trou SOUS LE CURSEUR même quand la colonne était
 * triée par priorité ou par date — c'est-à-dire à l'endroit où la carte n'allait
 * justement pas tomber. Ici la place vient de `previewBoardMove`, qui rejoue le
 * tri de la colonne cible : le trait est à l'arrivée réelle, curseur ou pas.
 *
 * **Il ne pousse rien, et c'est calculé.** S'insérer dans une pile en `gap-2`
 * ajoute une gouttière (8 px) plus sa propre hauteur (2 px) ; `-my-[5px]` reprend
 * les dix. Total : zéro. Sans ça, chaque changement de place décalerait les
 * cartes du dessous — donc les rectangles que dnd-kit mesure — et le repère
 * pourrait osciller entre deux positions au bord d'une carte.
 *
 * En contrepartie, il vit dans la gouttière : à la première place d'une colonne,
 * il frôle le bord haut du défileur, et **tout ce qu'il pose autour de son trait
 * y est à portée du découpage**. C'est ce qui a mangé son point rond en preview
 * (PR 66) : le `rounded-xl` de la colonne était posé sur le conteneur QUI
 * DÉFILE, et un arrondi rogne le contenu dans ses quatre arcs de coin. L'arrondi
 * est passé au parent — même boîte à l'écran, découpage carré — et la pastille
 * de compte descend sous le trait au lieu de monter au-dessus.
 */

import { useEffect, useRef, type RefObject } from "react";
import { cn } from "mangue-ui";
import type { DropPreview } from "@/lib/board-drag";

/** Ce que la colonne cherche dans le DOM pour amener le repère à l'écran. */
const MARKER_PROPS = { "data-board-drop-indicator": "" } as const;
const MARKER_SELECTOR = "[data-board-drop-indicator]";

/**
 * Amène le repère dans le champ de vision de sa colonne, UNE fois par entrée.
 *
 * Ça n'a l'air de rien et c'est ce qui rend les colonnes triées utilisables :
 * sous un tri par priorité ou par échéance, le point de chute ne doit rien au
 * curseur — on lâche en bas d'une colonne et la carte se range dix places plus
 * haut, souvent hors de la partie visible. Le repère serait alors juste et
 * invisible, c'est-à-dire inutile.
 *
 * Une fois par entrée dans la colonne, et pas à chaque déplacement : le défilement
 * change la carte la plus proche, donc le repère, donc le défilement — on
 * n'ouvre pas cette boucle-là. Ça suffit, parce que sous tri par champ la place
 * ne bouge plus une fois la colonne choisie, et que sous tri manuel elle est là
 * où l'on pointe, donc déjà visible.
 */
export function useRevealDropIndicator(
  scroller: RefObject<HTMLElement | null>,
  preview: DropPreview | undefined
) {
  const revealed = useRef(false);
  useEffect(() => {
    if (!preview) {
      revealed.current = false;
      return;
    }
    if (revealed.current) return;
    revealed.current = true;
    const box = scroller.current;
    const mark = box?.querySelector(MARKER_SELECTOR);
    if (!box || !mark) return;
    const target = mark.getBoundingClientRect();
    const view = box.getBoundingClientRect();
    if (target.top >= view.top && target.bottom <= view.bottom) return;
    box.scrollTo({
      top:
        box.scrollTop + (target.top - view.top) - view.height / 2 + target.height / 2,
      behavior: "smooth",
    });
  }, [preview, scroller]);
}

export function BoardDropIndicator({
  count = 1,
  className,
}: {
  /** Taille du paquet — au-delà d'un ticket, le trait la porte en pastille. */
  count?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      {...MARKER_PROPS}
      className={cn(
        "relative -my-[5px] h-0.5 shrink-0 rounded-full bg-primary",
        className
      )}
    >
      <span className="absolute -left-1 top-1/2 size-2 -translate-y-1/2 rounded-full bg-primary" />
      {/* La pastille descend sous le trait plutôt qu'au-dessus : posée en
          `-top-2`, elle passait au-dessus du bord haut de la colonne — donc
          hors du champ découpé — quand le paquet se posait en première place. */}
      {count > 1 && (
        <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
          {count}
        </span>
      )}
    </div>
  );
}
